import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SEAT_WIND_LABELS } from '@/types';
import { GripVertical } from 'lucide-react';

export interface SortableItem {
  id: string;
  nickname: string;
  avatar: string | null;
}

interface Props {
  items: SortableItem[];
  onReorder: (items: SortableItem[]) => void;
  children: (item: SortableItem, index: number) => React.ReactNode;
  disabled?: boolean;
}

export default function SortablePlayerList({ items, onReorder, children, disabled }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    onReorder(arrayMove(items, oldIndex, newIndex));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {items.map((item, index) => (
            <SortableItemRow
              key={item.id}
              item={item}
              index={index}
              disabled={disabled}
            >
              {children(item, index)}
            </SortableItemRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableItemRow({
  item,
  index,
  disabled,
  children,
}: {
  item: SortableItem;
  index: number;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const wind = SEAT_WIND_LABELS[index] || `${index + 1}`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="p-3 rounded-xl flex items-start gap-2"
    >
      <div
        className="flex flex-col items-center pt-2 cursor-grab active:cursor-grabbing"
        {...(disabled ? {} : { ...attributes, ...listeners })}
        style={{ color: disabled ? 'var(--color-border)' : 'var(--color-text-light)' }}
      >
        <GripVertical size={16} />
        <div
          className="text-xs font-bold mt-1"
          style={{ color: index === 0 ? '#e68a00' : 'var(--color-text-light)' }}
        >
          {wind}
        </div>
      </div>
      <div className="flex-1">
        {children}
      </div>
    </div>
  );
}
