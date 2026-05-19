import React from 'react';

// Parse WhatsApp-style formatting: **bold**, *italic*, ~~strike~~, `code`, ```code blocks```
export function formatWhatsAppText(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Split by code blocks first (```...```)
  const codeBlockParts = text.split(/(```[\s\S]*?```)/g);

  codeBlockParts.forEach((part, partIdx) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const code = part.slice(3, -3).replace(/^\n/, '');
      nodes.push(
        <pre key={`cb-${partIdx}`} className="bg-black/10 dark:bg-white/10 rounded px-2 py-1 my-1 text-xs overflow-x-auto font-mono">
          {code}
        </pre>
      );
      return;
    }

    // Process inline formatting line by line to preserve whitespace
    const lines = part.split('\n');
    lines.forEach((line, lineIdx) => {
      if (lineIdx > 0) nodes.push(<br key={`br-${partIdx}-${lineIdx}`} />);

      // Regex to match: **bold**, *italic*, ~~strike~~, `code`
      const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|~~(.+?)~~|`(.+?)`)/g;
      let lastIndex = 0;
      let match;

      while ((match = regex.exec(line)) !== null) {
        // Text before this match
        if (match.index > lastIndex) {
          nodes.push(line.slice(lastIndex, match.index));
        }

        if (match[2]) {
          // **bold**
          nodes.push(<strong key={`b-${partIdx}-${lineIdx}-${match.index}`}>{match[2]}</strong>);
        } else if (match[3]) {
          // *italic*
          nodes.push(<em key={`i-${partIdx}-${lineIdx}-${match.index}`}>{match[3]}</em>);
        } else if (match[4]) {
          // ~~strike~~
          nodes.push(<del key={`s-${partIdx}-${lineIdx}-${match.index}`}>{match[4]}</del>);
        } else if (match[5]) {
          // `code`
          nodes.push(
            <code key={`c-${partIdx}-${lineIdx}-${match.index}`} className="bg-black/10 dark:bg-white/10 rounded px-1 py-0.5 text-xs font-mono">
              {match[5]}
            </code>
          );
        }

        lastIndex = match.index + match[0].length;
      }

      // Remaining text after last match
      if (lastIndex < line.length) {
        nodes.push(line.slice(lastIndex));
      }
    });
  });

  return nodes;
}
