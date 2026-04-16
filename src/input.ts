/**
 * Read a line from stdin without echoing characters to the terminal.
 * Falls back to normal (visible) input if stdin is not a TTY.
 */
export function readSecret(prompt: string): Promise<string> {
    return new Promise((resolve) => {
        process.stderr.write(prompt);
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }
        process.stdin.resume();
        process.stdin.setEncoding('utf-8');

        let input = '';
        const onData = (ch: string) => {
            if (ch === '\n' || ch === '\r' || ch === '\u0004') {
                if (process.stdin.isTTY) {
                    process.stdin.setRawMode(false);
                }
                process.stdin.pause();
                process.stdin.removeListener('data', onData);
                process.stderr.write('\n');
                resolve(input.trim());
            } else if (ch === '\u0003') {
                // Ctrl+C
                if (process.stdin.isTTY) {
                    process.stdin.setRawMode(false);
                }
                process.exit(130);
            } else if (ch === '\u007f' || ch === '\b') {
                // Backspace
                if (input.length > 0) {
                    input = input.slice(0, -1);
                }
            } else {
                input += ch;
            }
        };
        process.stdin.on('data', onData);
    });
}
