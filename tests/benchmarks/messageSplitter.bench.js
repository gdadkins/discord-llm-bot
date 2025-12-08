"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMessageSplitterBenchmarks = runMessageSplitterBenchmarks;
const base_1 = require("./base");
const messageSplitter_1 = require("../../src/utils/messageSplitter");
async function runMessageSplitterBenchmarks() {
    const suite = new base_1.BenchmarkSuite();
    // Test data generation
    const generateMessage = (paragraphs, wordsPerParagraph) => {
        const words = ['The', 'quick', 'brown', 'fox', 'jumps', 'over', 'the', 'lazy', 'dog'];
        const sentences = [];
        for (let p = 0; p < paragraphs; p++) {
            const paragraph = [];
            for (let s = 0; s < 5; s++) {
                const sentence = [];
                for (let w = 0; w < wordsPerParagraph / 5; w++) {
                    sentence.push(words[Math.floor(Math.random() * words.length)]);
                }
                paragraph.push(sentence.join(' ') + '.');
            }
            sentences.push(paragraph.join(' '));
        }
        return sentences.join('\n\n');
    };
    const generateCodeBlock = (lines) => {
        let code = '```typescript\n';
        for (let i = 0; i < lines; i++) {
            code += `function example${i}() {\n`;
            code += `  console.log("This is line ${i} of the code example");\n`;
            code += `  return ${i} * ${i};\n`;
            code += '}\n\n';
        }
        code += '```';
        return code;
    };
    // Benchmark 1: Short messages (no splitting needed)
    suite.add('MessageSplitter - short message (< 2000 chars)', () => {
        const message = generateMessage(5, 50);
        (0, messageSplitter_1.splitMessage)(message);
    }, { iterations: 50000 });
    // Benchmark 2: Medium messages (1-2 splits)
    suite.add('MessageSplitter - medium message (~4000 chars)', () => {
        const message = generateMessage(20, 50);
        (0, messageSplitter_1.splitMessage)(message);
    }, { iterations: 10000 });
    // Benchmark 3: Long messages (multiple splits)
    suite.add('MessageSplitter - long message (~10000 chars)', () => {
        const message = generateMessage(50, 50);
        (0, messageSplitter_1.splitMessage)(message);
    }, { iterations: 5000 });
    // Benchmark 4: Very long messages (stress test)
    suite.add('MessageSplitter - very long message (~50000 chars)', () => {
        const message = generateMessage(250, 50);
        (0, messageSplitter_1.splitMessage)(message);
    }, { iterations: 1000 });
    // Benchmark 5: Code block handling
    suite.add('MessageSplitter - code blocks', () => {
        const message = generateCodeBlock(50);
        (0, messageSplitter_1.splitMessage)(message);
    }, { iterations: 10000 });
    // Benchmark 6: Mixed content (text + code)
    suite.add('MessageSplitter - mixed content', () => {
        const text = generateMessage(10, 40);
        const code = generateCodeBlock(20);
        const message = `${text}\n\nHere's some code:\n\n${code}\n\n${generateMessage(5, 40)}`;
        (0, messageSplitter_1.splitMessage)(message);
    }, { iterations: 5000 });
    // Benchmark 7: Edge cases
    suite.add('MessageSplitter - no natural break points', () => {
        // Create a message with no spaces or newlines
        const message = 'a'.repeat(5000);
        (0, messageSplitter_1.splitMessage)(message);
    }, { iterations: 10000 });
    suite.add('MessageSplitter - many small paragraphs', () => {
        // Create many single-line paragraphs
        const lines = [];
        for (let i = 0; i < 200; i++) {
            lines.push(`Line ${i}: This is a short line of text.`);
        }
        const message = lines.join('\n');
        (0, messageSplitter_1.splitMessage)(message);
    }, { iterations: 5000 });
    // Benchmark 8: Unicode and special characters
    suite.add('MessageSplitter - unicode content', () => {
        const unicodeText = '你好世界 🌍 Hello World 💻 Привет мир 🚀 مرحبا بالعالم\n'.repeat(100);
        const message = generateMessage(5, 30) + '\n\n' + unicodeText + '\n\n' + generateMessage(5, 30);
        (0, messageSplitter_1.splitMessage)(message);
    }, { iterations: 5000 });
    // Benchmark 9: Performance with different split boundaries
    suite.add('MessageSplitter - exact 2000 char boundaries', () => {
        // Create message that exactly hits 2000 char boundaries
        const chunk = 'x'.repeat(1999) + '\n';
        const message = chunk.repeat(5);
        (0, messageSplitter_1.splitMessage)(message);
    }, { iterations: 10000 });
    // Benchmark 10: Worst-case scenario - many potential split points
    suite.add('MessageSplitter - many split points', () => {
        // Create a message with many periods and newlines
        const sentences = [];
        for (let i = 0; i < 500; i++) {
            sentences.push(`Sentence ${i}.`);
        }
        const message = sentences.join(' ');
        (0, messageSplitter_1.splitMessage)(message);
    }, { iterations: 2000 });
    // Run benchmarks
    const results = await suite.run();
    // Additional analysis
    console.log('\nMessage Splitter Performance Analysis:');
    console.log('=====================================');
    const shortResult = results.find(r => r.name.includes('short message'));
    const longResult = results.find(r => r.name.includes('very long message'));
    if (shortResult && longResult) {
        const scaleFactor = longResult.avgTimePerOp / shortResult.avgTimePerOp;
        console.log(`Performance scales ${scaleFactor.toFixed(2)}x from short to very long messages`);
    }
    return results;
}
// If running directly
if (require.main === module) {
    runMessageSplitterBenchmarks().then(() => {
        console.log('Message Splitter benchmarks completed');
    });
}
//# sourceMappingURL=messageSplitter.bench.js.map