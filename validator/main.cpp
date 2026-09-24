// Loads behavior files with BehaviorTree.CPP itself, to report the errors the
// library would raise at runtime when registering and instantiating them.
//
// The custom nodes of the application are not available here, so each node
// declared in a TreeNodesModel is registered as a dummy with the declared
// ports. BehaviorTree.CPP then checks the XML, the node types, the port names
// and the SubTree references exactly as it would in the real application.
//
// Usage:
//   btcpp_validate <manifest.json>   Validate; the manifest lists the files
//                                    and the custom node models.
//   btcpp_validate --builtins        Print the built-in node models as JSON.
//
// The manifest is: {"files": ["/abs/a.xml", ...], "models": [{"id": "...",
// "category": "Action", "ports": [{"direction": "input", "name": "...",
// "default": "...", "description": "..."}]}]}
//
// Each finding is printed as one JSON object per line:
//   {"level": "error", "file": "...", "tree": "...", "message": "..."}
// The exit code is 1 when there is at least one error.

#include <behaviortree_cpp/bt_factory.h>
#include <behaviortree_cpp/contrib/json.hpp>

#include <fstream>
#include <iostream>
#include <map>

using json = nlohmann::json;

namespace
{

class DummyAction : public BT::SyncActionNode
{
public:
  using SyncActionNode::SyncActionNode;
  BT::NodeStatus tick() override { return BT::NodeStatus::SUCCESS; }
};

class DummyCondition : public BT::ConditionNode
{
public:
  using ConditionNode::ConditionNode;
  BT::NodeStatus tick() override { return BT::NodeStatus::SUCCESS; }
};

class DummyDecorator : public BT::DecoratorNode
{
public:
  using DecoratorNode::DecoratorNode;
  BT::NodeStatus tick() override { return BT::NodeStatus::SUCCESS; }
};

class DummyControl : public BT::ControlNode
{
public:
  using ControlNode::ControlNode;
  BT::NodeStatus tick() override { return BT::NodeStatus::SUCCESS; }
};

bool errors_found = false;

void report(const std::string& level, const std::string& file, const std::string& tree,
            const std::string& message)
{
  if(level == "error")
  {
    errors_found = true;
  }
  json line = { { "level", level }, { "file", file }, { "message", message } };
  if(!tree.empty())
  {
    line["tree"] = tree;
  }
  std::cout << line.dump() << std::endl;
}

std::string directionName(BT::PortDirection direction)
{
  switch(direction)
  {
    case BT::PortDirection::INPUT:
      return "input";
    case BT::PortDirection::OUTPUT:
      return "output";
    default:
      return "inout";
  }
}

BT::PortDirection parseDirection(const std::string& name)
{
  if(name == "input")
  {
    return BT::PortDirection::INPUT;
  }
  if(name == "output")
  {
    return BT::PortDirection::OUTPUT;
  }
  return BT::PortDirection::INOUT;
}

template <typename T>
BT::NodeBuilder builder()
{
  return [](const std::string& name, const BT::NodeConfig& config) {
    return std::make_unique<T>(name, config);
  };
}

int printBuiltins()
{
  BT::BehaviorTreeFactory factory;
  json models = json::array();
  for(const auto& id : factory.builtinNodes())
  {
    const auto& manifest = factory.manifests().at(id);
    json ports = json::array();
    for(const auto& [name, info] : manifest.ports)
    {
      json port = { { "direction", directionName(info.direction()) }, { "name", name } };
      if(info.type() != typeid(void) && info.type() != typeid(BT::AnyTypeAllowed))
      {
        port["type"] = BT::demangle(info.type());
      }
      if(!info.defaultValue().empty())
      {
        port["default"] = info.defaultValueString();
      }
      if(!info.description().empty())
      {
        port["description"] = info.description();
      }
      ports.push_back(port);
    }
    models.push_back(
        { { "id", id }, { "category", BT::toStr(manifest.type) }, { "ports", ports } });
  }
  std::cout << models.dump(2) << std::endl;
  return 0;
}

void registerModel(BT::BehaviorTreeFactory& factory, const json& model)
{
  BT::TreeNodeManifest manifest;
  manifest.registration_ID = model.at("id").get<std::string>();
  const auto category = model.at("category").get<std::string>();

  for(const auto& port : model.value("ports", json::array()))
  {
    BT::PortInfo info(parseDirection(port.value("direction", "input")));
    info.setDescription(port.value("description", ""));
    if(port.contains("default"))
    {
      info.setDefaultValue(port.at("default").get<std::string>());
    }
    manifest.ports.insert({ port.at("name").get<std::string>(), info });
  }

  BT::NodeBuilder node_builder;
  if(category == "Action")
  {
    manifest.type = BT::NodeType::ACTION;
    node_builder = builder<DummyAction>();
  }
  else if(category == "Condition")
  {
    manifest.type = BT::NodeType::CONDITION;
    node_builder = builder<DummyCondition>();
  }
  else if(category == "Decorator")
  {
    manifest.type = BT::NodeType::DECORATOR;
    node_builder = builder<DummyDecorator>();
  }
  else if(category == "Control")
  {
    manifest.type = BT::NodeType::CONTROL;
    node_builder = builder<DummyControl>();
  }
  else
  {
    return;  // SubTree models describe trees, which are registered from the files.
  }
  factory.registerBuilder(manifest, node_builder);
}

int validate(const std::string& manifest_path)
{
  std::ifstream stream(manifest_path);
  if(!stream)
  {
    std::cerr << "Cannot open " << manifest_path << std::endl;
    return 2;
  }
  const json manifest = json::parse(stream);

  BT::BehaviorTreeFactory factory;
  for(const auto& model : manifest.value("models", json::array()))
  {
    const auto id = model.at("id").get<std::string>();
    if(factory.builtinNodes().count(id) != 0 || factory.manifests().count(id) != 0)
    {
      continue;  // Reported by the editor's own checks.
    }
    try
    {
      registerModel(factory, model);
    }
    catch(const std::exception& e)
    {
      report("error", "", "", "Cannot register the model \"" + id + "\": " + e.what());
    }
  }

  // Remember which file each tree comes from: the factory only knows IDs.
  std::map<std::string, std::string> tree_files;
  for(const auto& file : manifest.value("files", json::array()))
  {
    const auto path = file.get<std::string>();
    const auto before = factory.registeredBehaviorTrees();
    try
    {
      factory.registerBehaviorTreeFromFile(path);
    }
    catch(const std::exception& e)
    {
      report("error", path, "", e.what());
      continue;
    }
    for(const auto& id : factory.registeredBehaviorTrees())
    {
      if(std::find(before.begin(), before.end(), id) == before.end())
      {
        tree_files[id] = path;
      }
    }
  }

  for(const auto& [id, file] : tree_files)
  {
    try
    {
      auto tree = factory.createTree(id);
    }
    catch(const std::exception& e)
    {
      report("error", file, id, e.what());
    }
  }
  return errors_found ? 1 : 0;
}

}  // namespace

int main(int argc, char** argv)
{
  if(argc != 2)
  {
    std::cerr << "Usage: btcpp_validate <manifest.json> | --builtins" << std::endl;
    return 2;
  }
  const std::string argument = argv[1];
  try
  {
    return argument == "--builtins" ? printBuiltins() : validate(argument);
  }
  catch(const std::exception& e)
  {
    std::cerr << e.what() << std::endl;
    return 2;
  }
}
