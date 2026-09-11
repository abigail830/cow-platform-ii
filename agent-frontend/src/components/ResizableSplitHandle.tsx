import type { MouseEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { iconProps } from './icons/icon-props.ts';

type ResizableSplitHandleProps = {
  orientation?: 'vertical' | 'horizontal';
  isDragging?: boolean;
  leftCollapsed?: boolean;
  collapsibleLeft?: boolean;
  ariaLabel?: string;
  onMouseDown: (event: MouseEvent) => void;
  onCollapseLeft?: () => void;
  onExpandLeft?: () => void;
  onDoubleClick?: () => void;
};

export function ResizableSplitHandle({
  orientation = 'vertical',
  isDragging = false,
  leftCollapsed = false,
  collapsibleLeft = false,
  ariaLabel = 'Resize panels',
  onMouseDown,
  onCollapseLeft,
  onExpandLeft,
  onDoubleClick,
}: ResizableSplitHandleProps) {
  const isVertical = orientation === 'vertical';

  function handleCollapseClick(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (leftCollapsed) {
      onExpandLeft?.();
    } else {
      onCollapseLeft?.();
    }
  }

  return (
    <div
      className={[
        'resizable-split-handle',
        isVertical ? 'is-vertical' : 'is-horizontal',
        isDragging ? 'is-dragging' : '',
        leftCollapsed ? 'is-left-collapsed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="separator"
      aria-orientation={isVertical ? 'vertical' : 'horizontal'}
      aria-label={ariaLabel}
      aria-valuenow={leftCollapsed ? 0 : undefined}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
    >
      <span className="resizable-split-handle-bar" aria-hidden />

      {collapsibleLeft ? (
        <button
          type="button"
          className="resizable-split-handle-collapse-btn"
          title={leftCollapsed ? 'Expand panel' : 'Collapse panel'}
          aria-label={leftCollapsed ? 'Expand panel' : 'Collapse panel'}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={handleCollapseClick}
        >
          {leftCollapsed ? (
            <ChevronRight {...iconProps({ size: 12 })} aria-hidden />
          ) : (
            <ChevronLeft {...iconProps({ size: 12 })} aria-hidden />
          )}
        </button>
      ) : null}
    </div>
  );
}
