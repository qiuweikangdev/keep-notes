export interface HoveredTableDeleteTarget {
  blockId: string;
  tableRoot: HTMLElement;
  tableWrapper: HTMLElement;
}

export interface TableDeleteButtonPosition {
  top: number;
  left: number;
}

const TABLE_CONTENT_SELECTOR = '[data-content-type="table"]';
const TABLE_DELETE_BUTTON_SELECTOR = "[data-keep-notes-table-delete]";
const TABLE_DELETE_BUTTON_SIZE = 24;
const TABLE_DELETE_BUTTON_TOP_OFFSET = -14;
const TABLE_DELETE_BUTTON_RIGHT_OFFSET = 12;

export function isTableDeleteButtonTarget(
  target: EventTarget | null,
): target is Element {
  return (
    target instanceof Element && !!target.closest(TABLE_DELETE_BUTTON_SELECTOR)
  );
}

export function findHoveredTableDeleteTarget(
  target: EventTarget | null,
): HoveredTableDeleteTarget | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const tableRoot = target.closest<HTMLElement>(TABLE_CONTENT_SELECTOR);
  if (!tableRoot) {
    return null;
  }

  const blockId =
    tableRoot.dataset.id ??
    tableRoot.closest<HTMLElement>("[data-id]")?.dataset.id ??
    null;
  if (!blockId) {
    return null;
  }

  const tableWrapper =
    tableRoot.querySelector<HTMLElement>(".tableWrapper") ??
    tableRoot.querySelector<HTMLElement>("table") ??
    tableRoot;

  return {
    blockId,
    tableRoot,
    tableWrapper,
  };
}

export function getTableDeleteButtonPosition(
  tableWrapper: HTMLElement,
  scrollContainer: HTMLElement,
): TableDeleteButtonPosition | null {
  const wrapperRect = tableWrapper.getBoundingClientRect();
  const containerRect = scrollContainer.getBoundingClientRect();

  if (wrapperRect.width === 0 || wrapperRect.height === 0) {
    return null;
  }

  return {
    top:
      wrapperRect.top -
      containerRect.top +
      scrollContainer.scrollTop +
      TABLE_DELETE_BUTTON_TOP_OFFSET,
    left:
      wrapperRect.right -
      containerRect.left +
      scrollContainer.scrollLeft +
      TABLE_DELETE_BUTTON_RIGHT_OFFSET,
  };
}

export function isPointerWithinTableDeleteHoverZone(
  tableWrapper: HTMLElement,
  pointerX: number,
  pointerY: number,
): boolean {
  const wrapperRect = tableWrapper.getBoundingClientRect();

  return (
    pointerX >= wrapperRect.left &&
    pointerX <=
      wrapperRect.right +
        TABLE_DELETE_BUTTON_RIGHT_OFFSET +
        TABLE_DELETE_BUTTON_SIZE &&
    pointerY >= wrapperRect.top + TABLE_DELETE_BUTTON_TOP_OFFSET &&
    pointerY <= wrapperRect.bottom
  );
}
