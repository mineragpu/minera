/** Shows text with its `backticked` parts as code, for messages that name a command. */
export function InlineCode({ text }: { text: string }) {
  return (
    <>
      {text.split('`').map((part, index) => (index % 2 === 1 ? <code key={index}>{part}</code> : part))}
    </>
  );
}
