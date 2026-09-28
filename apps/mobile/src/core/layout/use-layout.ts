import { useWindowDimensions } from 'react-native';

/** Material 3 window size classes. */
export type SizeClass = 'compact' | 'medium' | 'expanded';

export type Layout = {
  width: number;
  height: number;
  sizeClass: SizeClass;
  /** Grid columns for card lists. */
  columns: 1 | 2 | 3;
  /** Readable content width; content is centred beyond it. */
  contentMaxWidth: number;
  /** Navigation rail instead of a bottom bar. */
  useRail: boolean;
};

export function layoutFor(width: number, height: number): Layout {
  const sizeClass: SizeClass = width < 600 ? 'compact' : width < 840 ? 'medium' : 'expanded';
  return {
    width,
    height,
    sizeClass,
    columns: sizeClass === 'compact' ? 1 : sizeClass === 'medium' ? 2 : 3,
    contentMaxWidth: sizeClass === 'expanded' ? 1040 : 720,
    useRail: sizeClass !== 'compact',
  };
}

export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  return layoutFor(width, height);
}
