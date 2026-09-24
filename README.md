# Behavior Editor

A simple editor for [BehaviorTree.CPP](https://www.behaviortree.dev/) 4
behaviors, like Groot2 but with a tree instead of a graph.

![The behavior editor: the workspace on the left, the tree in the middle and the details of the selection on the right](docs/screenshot.png)

- **Workspace** (left), in three resizable sections. **Objectives**: the XML files of the
  folder and the trees in each. **Behaviors**: the node types declared in a
  `<TreeNodesModel>` (your C++ nodes), with how often each is used; click one to
  see its ports and the trees that use it, highlighted in the open tree; drag
  one onto the tree to add it there. **Built-in nodes**: BehaviorTree.CPP's own
  nodes (Sequence, Fallback, Inverter, Repeat, Script…) by category, which can
  be clicked and dragged the same way.
- **Tree** (center): the selected tree as a collapsible, indented list. Add
  nodes and SubTrees, drag them around, cut, copy, paste, undo. A SubTree can be
  expanded in place to show the tree it includes. The **XML** tab shows the file
  as it will be written, read-only. A file that is not valid XML shows its
  error; fix it in a text editor and reload the folder.
- **Inspector** (right): the selected node's instance name, ports, scripts
  (`_skipIf`, `_onSuccess`…) and node type, or, with no node selected, the
  behavior's ID, description, ports (its interface as a SubTree) and which trees
  use it.

Run it with docker; see [docker/README.md](docker/README.md):

```bash
./docker/dock.sh editor build
./docker/dock.sh editor serve ~/my_robot/behaviors   # http://localhost:8080
```

## How files are read and written

All the XML files in the folder, sub-folders included, form one workspace, the
way an application that registers every file in one `BehaviorTreeFactory` sees
them: a SubTree can refer to a tree of any file, and a node type declared in
any file's `<TreeNodesModel>` can be used everywhere. The editor declares new
node types in the file that already declares the most (e.g. a `nodes.xml`).

Saving rewrites the whole file in Groot2's layout: two-space indentation, one
element per line. Comments are kept, and so are elements the editor does not
know, such as `<include>`. Only BTCPP format 4 is supported.

## Validation

Two layers, both run on unsaved edits too:

1. **The editor's checks** run on every change and mark the offending rows:
   XML syntax, unknown node types, the number of children per node
   (a Decorator has one, IfThenElse two or three, Switch3 four…), unknown ports,
   input ports without a value or default, literals of the wrong type
   (`num_cycles="many"`), output ports that are not `{blackboard}` references,
   SubTrees pointing to missing trees, recursive SubTrees, duplicate tree IDs,
   and a `main_tree_to_execute` that does not exist.
2. **BehaviorTree.CPP itself** (the *Check with BehaviorTree.CPP* button): the
   program in `validator/` registers each declared node type as a dummy with
   its declared ports, registers every file and instantiates every tree, then
   reports what the library refuses. This catches whatever the first layer
   misses, with the library's own messages. It needs the library, so it is
   built in the container only.

The same checks run from the command line, e.g. in CI or a pre-commit hook;
the exit code is 1 on any error:

```bash
validate.sh [folder] [--json] [--editor-only]
```

## Your own node types

Nodes implemented in C++ are unknown to the editor until they are declared in a
`<TreeNodesModel>` somewhere in the folder. Rather than writing that by hand,
generate it from your real registration, so that it includes the ports added
behind your back (behaviortree_ros2's `action_name`, `service_name`,
`topic_name`):

```cpp
BT::BehaviorTreeFactory factory;
registerNodes(factory, BT::RosNodeParams());    // your registration function
std::cout << BT::writeTreeNodesModelXML(factory, false);
```

Save the output in the folder, e.g. `models/my_nodes.xml`, and add a test that
fails when it is out of date. The editor shows a file of models only as a list
of node types, and does not let you edit a model in a file whose header comment
says it is generated. XML files that are not behaviors (whose first element is
not `<root>`, like a ROS `package.xml`) are ignored.

## Layout

```
bin/          update, build, serve, dev, test and validate scripts
docker/       the container
behaviors/    example behaviors, the default folder
src/shared/   XML model, parser and writer, workspace index, checks (browser and Node.js)
src/server/   the HTTP API over the folder, and the runner of the native validator
src/client/   the React editor
src/cli/      validate.sh
validator/    the BehaviorTree.CPP validator (C++)
tests/        unit tests (vitest)
```
