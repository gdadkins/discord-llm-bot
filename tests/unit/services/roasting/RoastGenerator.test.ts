import { RoastGenerator } from '../../../../src/services/roasting/RoastGenerator';

describe('RoastGenerator', () => {
  let roastGenerator: RoastGenerator;

  beforeEach(() => {
    roastGenerator = new RoastGenerator();
  });

  describe('calculateComplexity', () => {
    it('should increase complexity based on message length', () => {
      const shortMessage = 'Hi';
      const longMessage = 'This is a much longer message that should have higher complexity than the short one due to its length';
      const veryLongMessage = 'This is an extremely long message that contains lots of text and should definitely have much higher complexity than shorter messages because it has so many words and characters in it that it becomes more complex to process and understand completely. This message is intentionally very verbose to ensure we get a clear difference in complexity calculations based on message length alone without any other modifying factors that might interfere with the test results.';

      const shortComplexity = roastGenerator.calculateComplexity(shortMessage);
      const longComplexity = roastGenerator.calculateComplexity(longMessage);
      const veryLongComplexity = roastGenerator.calculateComplexity(veryLongMessage);


      expect(shortComplexity).toBeGreaterThanOrEqual(0);
      expect(longComplexity).toBeGreaterThanOrEqual(shortComplexity);
      expect(veryLongComplexity).toBeGreaterThanOrEqual(longComplexity);
    });

    it('should detect code patterns', () => {
      const regularMessage = 'How do I do this?';
      const codeMessage = 'How do I use ```const x = 5;```?';
      const programmingMessage = 'Can you help me with this function and class import?';
      const technicalMessage = 'My API server has a database error exception';

      const regularComplexity = roastGenerator.calculateComplexity(regularMessage);
      const codeComplexity = roastGenerator.calculateComplexity(codeMessage);
      const programmingComplexity = roastGenerator.calculateComplexity(programmingMessage);
      const technicalComplexity = roastGenerator.calculateComplexity(technicalMessage);

      // Code message should have higher complexity than regular
      expect(codeComplexity).toBeGreaterThan(regularComplexity);
      // Programming keywords should increase complexity
      expect(programmingComplexity).toBeGreaterThan(regularComplexity);
      // Technical terms should increase complexity
      expect(technicalComplexity).toBeGreaterThan(regularComplexity);
    });

    it('should detect questions', () => {
      const statement = 'I need help with this';
      const singleQuestion = 'Can you help me with this?';
      const multipleQuestions = 'What is this? How does it work? Can you explain?';

      const statementComplexity = roastGenerator.calculateComplexity(statement);
      const singleQuestionComplexity = roastGenerator.calculateComplexity(singleQuestion);
      const multipleQuestionsComplexity = roastGenerator.calculateComplexity(multipleQuestions);

      // Questions should have higher complexity
      expect(singleQuestionComplexity).toBeGreaterThan(statementComplexity);
      // Multiple questions should have even higher complexity
      expect(multipleQuestionsComplexity).toBeGreaterThan(singleQuestionComplexity);
    });
  });

  describe('calculateConsecutive', () => {
    it('should return 0 for 0 questions', () => {
      const result = roastGenerator.calculateConsecutive(0);
      expect(result).toBe(0);
    });

    it('should increase with consecutive questions', () => {
      const oneQuestion = roastGenerator.calculateConsecutive(1);
      const twoQuestions = roastGenerator.calculateConsecutive(2);
      const fiveQuestions = roastGenerator.calculateConsecutive(5);

      expect(oneQuestion).toBeGreaterThan(0);
      expect(twoQuestions).toBeGreaterThan(oneQuestion);
      expect(fiveQuestions).toBeGreaterThan(twoQuestions);
    });
  });
});