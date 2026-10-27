import { useCallback, useMemo, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, fonts } from '../ui/theme';
import type { ProviderEntry, ProviderStack } from './stack';

const ROW_HEIGHT = 96;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function ProviderDragRow({
  entry,
  index,
  busy,
  isDragging,
  dragY,
  onDragStart,
  onDragEnd,
  onToggle,
}: {
  entry: ProviderEntry;
  index: number;
  busy: boolean;
  isDragging: boolean;
  dragY: Animated.Value;
  onDragStart: (index: number) => void;
  onDragEnd: (from: number, dy: number) => void;
  onToggle: (id: string, enabled: boolean) => void;
}) {
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !busy,
        onMoveShouldSetPanResponder: (_e, g) => !busy && Math.abs(g.dy) > 6,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          onDragStart(index);
          dragY.setValue(0);
        },
        onPanResponderMove: (_e, g) => {
          dragY.setValue(g.dy);
        },
        onPanResponderRelease: (_e, g) => {
          onDragEnd(index, g.dy);
        },
        onPanResponderTerminate: (_e, g) => {
          onDragEnd(index, g.dy);
        },
      }),
    [busy, dragY, index, onDragEnd, onDragStart]
  );

  return (
    <Animated.View
      style={[
        styles.card,
        isDragging && styles.cardDragging,
        isDragging
          ? {
              zIndex: 20,
              elevation: 6,
              transform: [{ translateY: dragY }],
            }
          : null,
      ]}
    >
      <View style={styles.cardTop}>
        <View
          {...pan.panHandlers}
          style={[styles.handle, busy && styles.handleDisabled]}
          accessibilityRole="adjustable"
          accessibilityLabel={`Drag to reorder ${entry.label}`}
          accessibilityHint="Drag up or down to change provider priority"
        >
          <Text style={styles.handleText}>⋮⋮</Text>
        </View>
        <Text style={styles.cardTitle}>
          {index + 1}. {entry.label}
        </Text>
        <Pressable
          onPress={() => {
            onToggle(entry.id, !entry.enabled);
          }}
          disabled={busy}
          hitSlop={8}
        >
          <Text style={styles.toggle}>{entry.enabled ? 'ON' : 'OFF'}</Text>
        </Pressable>
      </View>
      <Text style={styles.meta}>kind · {entry.kind}</Text>
    </Animated.View>
  );
}

export function ProviderDragList({
  stack,
  busy,
  onReorder,
  onToggle,
  onDraggingChange,
}: {
  stack: ProviderStack;
  busy: boolean;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onDraggingChange?: (dragging: boolean) => void;
}) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragY] = useState(() => new Animated.Value(0));

  const rows = useMemo(
    () =>
      stack.order
        .map((id) => stack.entries[id])
        .filter((e): e is ProviderEntry => Boolean(e)),
    [stack]
  );

  const handleDragStart = useCallback(
    (index: number) => {
      if (busy) {
        return;
      }
      setDraggingIndex(index);
      onDraggingChange?.(true);
    },
    [busy, onDraggingChange]
  );

  const handleDragEnd = useCallback(
    (from: number, dy: number) => {
      const to = clamp(
        from + Math.round(dy / ROW_HEIGHT),
        0,
        Math.max(0, rows.length - 1)
      );
      setDraggingIndex(null);
      onDraggingChange?.(false);
      dragY.setValue(0);
      if (to !== from) {
        onReorder(from, to);
      }
    },
    [dragY, onDraggingChange, onReorder, rows.length]
  );

  return (
    <View style={styles.list}>
      {rows.map((entry, index) => (
        <ProviderDragRow
          key={entry.id}
          entry={entry}
          index={index}
          busy={busy}
          isDragging={draggingIndex === index}
          dragY={dragY}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onToggle={onToggle}
        />
      ))}
      <Text style={styles.hint}>Drag ⋮⋮ to change cascade priority</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 0 },
  card: {
    minHeight: ROW_HEIGHT - 8,
    borderWidth: 1,
    borderColor: colors.charcoal,
    padding: 12,
    gap: 6,
    marginBottom: 8,
    backgroundColor: colors.panel,
    justifyContent: 'center',
  },
  cardDragging: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(0, 255, 102, 0.1)',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  handle: {
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.charcoal,
    backgroundColor: colors.field,
  },
  handleDisabled: { opacity: 0.4 },
  handleText: {
    color: colors.muted,
    fontFamily: fonts.mono,
    fontSize: 14,
    letterSpacing: -2,
  },
  cardTitle: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 13,
    flex: 1,
  },
  toggle: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 12,
  },
  meta: {
    color: colors.muted,
    fontFamily: fonts.mono,
    fontSize: 11,
    paddingLeft: 44,
  },
  hint: {
    color: colors.muted,
    fontFamily: fonts.mono,
    fontSize: 11,
    marginTop: 4,
  },
});
