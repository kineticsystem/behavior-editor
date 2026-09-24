// A node type dragged from the Behaviors list onto the tree. The browser only
// reveals drag data on drop, so the ID is also kept here for dragover, where
// the drop position is computed.

export const MODEL_MIME = 'application/x-behavior-editor-model';

let draggedModel: string | undefined;

export function setDraggedModel(id: string | undefined) {
  draggedModel = id;
}

export function getDraggedModel(): string | undefined {
  return draggedModel;
}
