import { join } from 'node:path';
import type { BaseLogger, ContextGenerator, DatabaseNotification } from 'vintasend';
import { logMessageMatching, renderLogMessage } from 'vintasend';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type LiquidSmsTemplateRenderer, LiquidSmsTemplateRendererFactory } from '../index';

type MockConfig = {
  ContextMap: { testContext: ContextGenerator };
  NotificationIdType: string;
  UserIdType: string;
};

describe('LiquidSmsTemplateRenderer', () => {
  const fixturesPath = join(__dirname, 'fixtures');
  let renderer: LiquidSmsTemplateRenderer<MockConfig>;
  let mockNotification: DatabaseNotification<MockConfig>;

  beforeEach(() => {
    renderer = new LiquidSmsTemplateRendererFactory<MockConfig>().create({ root: fixturesPath });
    mockNotification = {
      id: '123',
      notificationType: 'SMS' as const,
      contextName: 'testContext',
      contextParameters: {},
      userId: '456',
      title: 'Test Notification',
      bodyTemplate: 'sms-reminder.liquid',
      subjectTemplate: null,
      extraParams: {},
      tenant: null,
      contextUsed: null,
      adapterUsed: null,
      status: 'PENDING_SEND' as const,
      sentAt: null,
      readAt: null,
      sendAfter: new Date(),
      gitCommitSha: null,
    };
  });

  function createLogger() {
    return { info: vi.fn(), warn: vi.fn(), error: vi.fn() } satisfies BaseLogger;
  }

  describe('render', () => {
    it('should render a template file without a subject template', async () => {
      const result = await renderer.render(mockNotification, { name: 'John', date: 'May 3' });

      expect(result).toEqual({
        subject: '',
        body: 'Hi John, your appointment is on May 3.\nReply STOP to opt out.',
      });
    });

    it('should not HTML-escape context values', async () => {
      const result = await renderer.render(mockNotification, {
        name: 'Tom & <Jerry>',
        date: "O'Neil's day",
      });

      expect(result.body).toContain("Hi Tom & <Jerry>, your appointment is on O'Neil's day.");
    });

    it('should honour an explicit outputEscape option', async () => {
      renderer = new LiquidSmsTemplateRendererFactory<MockConfig>().create({
        root: fixturesPath,
        outputEscape: 'escape',
      });

      const result = await renderer.render(mockNotification, { name: 'Tom & Jerry' });

      expect(result.body).toContain('Hi Tom &amp; Jerry,');
    });

    it('should render the subject template when one is given', async () => {
      const result = await renderer.render(
        { ...mockNotification, subjectTemplate: 'test-subject.liquid' },
        { name: 'John' },
      );

      expect(result.subject).toBe('Welcome John');
    });

    it('should throw when the body template is missing', async () => {
      await expect(renderer.render({ ...mockNotification, bodyTemplate: '' }, {})).rejects.toThrow(
        'Body template is required',
      );
    });

    it('should refuse templates outside the root', async () => {
      await expect(
        renderer.render(
          { ...mockNotification, bodyTemplate: '../liquid-sms-template-renderer.test.ts' },
          {},
        ),
      ).rejects.toThrow('Failed to lookup');
    });
  });

  describe('with an in-memory templates map', () => {
    const templates = {
      'sms/reminder.liquid': 'Hi {{ name }}. {% render "sms/signature.liquid" %}\n',
      'sms/signature.liquid': '- Clinic',
    };

    beforeEach(() => {
      renderer = new LiquidSmsTemplateRendererFactory<MockConfig>().create({ templates });
    });

    it('should render templates from the map, including partials', async () => {
      const result = await renderer.render(
        { ...mockNotification, bodyTemplate: 'sms/reminder.liquid' },
        { name: 'John' },
      );

      expect(result).toEqual({ subject: '', body: 'Hi John. - Clinic' });
    });

    it('should throw when the body template key is not in the map', async () => {
      await expect(
        renderer.render({ ...mockNotification, bodyTemplate: 'sms/missing.liquid' }, {}),
      ).rejects.toThrow('Body template "sms/missing.liquid" not found in templates');
    });

    it('should throw when a given subject template key is not in the map', async () => {
      await expect(
        renderer.render(
          {
            ...mockNotification,
            bodyTemplate: 'sms/reminder.liquid',
            subjectTemplate: 'sms/missing.liquid',
          },
          {},
        ),
      ).rejects.toThrow('Subject template "sms/missing.liquid" not found in templates');
    });
  });

  describe('renderFromTemplateContent', () => {
    it('should render content without a subject', async () => {
      const result = await renderer.renderFromTemplateContent(
        mockNotification,
        { subject: null, body: '  Code {{ code }} & more\n' },
        { code: '1234' },
      );

      expect(result).toEqual({ subject: '', body: 'Code 1234 & more' });
    });

    it('should render the subject content when one is given', async () => {
      const result = await renderer.renderFromTemplateContent(
        mockNotification,
        { subject: 'About {{ topic }}', body: 'Body' },
        { topic: 'your visit' },
      );

      expect(result.subject).toBe('About your visit');
    });
  });

  describe('logging', () => {
    it('should log SMS renders under its own name', async () => {
      const logger = createLogger();
      renderer.injectLogger(logger);

      await renderer.render(mockNotification, { name: 'Jane Synthetic' });

      expect(logger.info.mock.calls.map((call) => renderLogMessage(call[0]))).toEqual([
        '[LiquidSmsTemplateRenderer] Rendering SMS template for notification 123',
      ]);
    });

    it('should log the error name but never the message or context on failure', async () => {
      const logger = createLogger();
      renderer = new LiquidSmsTemplateRendererFactory<MockConfig>().create({
        configureEngine: (engine) =>
          engine.registerFilter('fail', (value: string) => {
            throw new Error(`Cannot send to ${value}`);
          }),
      });
      renderer.injectLogger(logger);

      // Synthetic data, not real PHI.
      await expect(
        renderer.renderFromTemplateContent(
          mockNotification,
          { subject: null, body: 'Hi {{ patientName | fail }}' },
          { patientName: 'Jane Synthetic' },
        ),
      ).rejects.toThrow('Jane Synthetic');

      expect(logger.error).toHaveBeenCalledWith(
        logMessageMatching(
          '[LiquidSmsTemplateRenderer] Error rendering body template content for notification 123: RenderError',
        ),
      );
      const lines = [logger.info, logger.error].flatMap((fn) =>
        fn.mock.calls.map((call) => renderLogMessage(call[0])),
      );
      for (const line of lines) {
        expect(line).not.toContain('Jane Synthetic');
        expect(line).not.toContain('patientName');
      }
    });
  });
});
