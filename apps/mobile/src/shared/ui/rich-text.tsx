import { StyleSheet, View } from 'react-native';

import { useStyles, type Theme } from '@/core/theme';

import { AppText } from './app-text';

type Block =
  | { type: 'heading'; text: string }
  | { type: 'bullet'; text: string; depth: number }
  | { type: 'numbered'; text: string; marker: string }
  | { type: 'paragraph'; text: string };

/** Parses the small Markdown subset AI results use: headings, lists, paragraphs, **bold**. */
export function parseBlocks(markdown: string): Block[] {
  return markdown
    .split(/\n+/)
    .map((line) => line.replace(/\s+$/, ''))
    .filter(Boolean)
    .map((line): Block => {
      const heading = /^#{1,6}\s+(.*)$/.exec(line);
      if (heading) return { type: 'heading', text: heading[1] ?? '' };
      const bullet = /^(\s*)[-*•]\s+(.*)$/.exec(line);
      if (bullet)
        return {
          type: 'bullet',
          text: bullet[2] ?? '',
          depth: Math.floor((bullet[1] ?? '').length / 2),
        };
      const numbered = /^\s*(\d+[.)])\s+(.*)$/.exec(line);
      if (numbered) return { type: 'numbered', marker: numbered[1] ?? '', text: numbered[2] ?? '' };
      return { type: 'paragraph', text: line };
    });
}

function Inline({ text, strong = false }: { text: string; strong?: boolean }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <AppText variant={strong ? 'bodyStrong' : 'body'}>
      {parts.map((part, index) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <AppText key={index} variant="bodyStrong">
            {part.slice(2, -2)}
          </AppText>
        ) : (
          part
        ),
      )}
    </AppText>
  );
}

export function RichText({ markdown }: { markdown: string }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.container}>
      {parseBlocks(markdown).map((block, index) => {
        switch (block.type) {
          case 'heading':
            return (
              <AppText
                key={index}
                variant="heading"
                style={styles.heading}
                accessibilityRole="header"
              >
                {block.text.replace(/\*\*/g, '')}
              </AppText>
            );
          case 'bullet':
          case 'numbered':
            return (
              <View
                key={index}
                style={[styles.item, block.type === 'bullet' && { paddingStart: block.depth * 16 }]}
              >
                <AppText color="textSecondary">
                  {block.type === 'bullet' ? '•' : block.marker}
                </AppText>
                <View style={styles.itemText}>
                  <Inline text={block.text} />
                </View>
              </View>
            );
          case 'paragraph':
            return <Inline key={index} text={block.text} />;
        }
      })}
    </View>
  );
}

const makeStyles = ({ spacing }: Theme) =>
  StyleSheet.create({
    container: { gap: spacing.sm },
    heading: { marginTop: spacing.sm },
    item: { flexDirection: 'row', gap: spacing.sm },
    itemText: { flex: 1 },
  });
