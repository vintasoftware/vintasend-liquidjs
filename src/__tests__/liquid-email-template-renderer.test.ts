import { join } from 'node:path';
import type { Liquid } from 'liquidjs';
import type { BaseLogger, ContextGenerator, DatabaseNotification } from 'vintasend';
import { logMessageMatching, renderLogMessage } from 'vintasend';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiquidEmailTemplateRenderer } from '../index';
import { LiquidEmailTemplateRendererFactory } from '../index';

type MockConfig = {
  ContextMap: { testContext: ContextGenerator };
  NotificationIdType: string;
  UserIdType: string;
};

describe('LiquidEmailTemplateRenderer', () => {
  const fixturesPath = join(__dirname, 'fixtures');
  let renderer: LiquidEmailTemplateRenderer<MockConfig>;
  let mockNotification: DatabaseNotification<MockConfig>;

  beforeEach(() => {
    renderer = new LiquidEmailTemplateRendererFactory<MockConfig>().create({ root: fixturesPath });
    mockNotification = {
      id: '123',
      notificationType: 'EMAIL' as const,
      contextName: 'testContext',
      contextParameters: {},
      userId: '456',
      title: 'Test Notification',
      bodyTemplate: 'test-notification.liquid',
      subjectTemplate: 'test-subject.liquid',
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

  function renderedLines(logger: ReturnType<typeof createLogger>): string[] {
    return [logger.info, logger.warn, logger.error].flatMap((fn) =>
      fn.mock.calls.map((call) => renderLogMessage(call[0])),
    );
  }

  it('should default to empty options', () => {
    renderer = new LiquidEmailTemplateRendererFactory<MockConfig>().create();
    // biome-ignore lint/complexity/useLiteralKeys: accessing protected attribute
    expect(renderer['options']).toStrictEqual({});
  });

  describe('render', () => {
    it('should render template files with context, including partials', async () => {
      const result = await renderer.render(mockNotification, {
        name: 'John',
        message: 'Hello World',
      });

      expect(result.subject).toBe('Welcome John');
      expect(result.body).toContain('<p>Hello John!</p>');
      expect(result.body).toContain('<p>Your message: Hello World</p>');
      expect(result.body).toContain('<footer>Sent to John</footer>');
    });

    it('should accept absolute paths inside the root', async () => {
      const result = await renderer.render(
        {
          ...mockNotification,
          bodyTemplate: join(fixturesPath, 'test-notification.liquid'),
          subjectTemplate: join(fixturesPath, 'test-subject.liquid'),
        },
        { name: 'John' },
      );

      expect(result.subject).toBe('Welcome John');
    });

    it('should refuse templates outside the root', async () => {
      await expect(
        renderer.render(
          { ...mockNotification, bodyTemplate: '../liquid-email-template-renderer.test.ts' },
          {},
        ),
      ).rejects.toThrow('Failed to lookup');
    });

    it('should handle empty context', async () => {
      const result = await renderer.render(mockNotification, {});

      expect(result.subject).toBe('Welcome');
      expect(result.body).toContain('<p>Hello !</p>');
      expect(result.body).toContain('<p>Your message: </p>');
    });

    it('should escape context values in the body but not in the subject', async () => {
      const result = await renderer.render(mockNotification, {
        name: 'Tom & <b>Jerry</b>',
        message: '<script>alert(1)</script>',
      });

      expect(result.subject).toBe('Welcome Tom & <b>Jerry</b>');
      expect(result.body).toContain('<p>Hello Tom &amp; &lt;b&gt;Jerry&lt;/b&gt;!</p>');
      expect(result.body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(result.body).not.toContain('<script>');
    });

    it('should honour an explicit outputEscape option for the body', async () => {
      renderer = new LiquidEmailTemplateRendererFactory<MockConfig>().create({
        root: fixturesPath,
        outputEscape: undefined,
      });

      const result = await renderer.render(mockNotification, { name: '<b>John</b>' });

      expect(result.body).toContain('<p>Hello <b>John</b>!</p>');
    });

    it('should collapse whitespace and newlines in the subject', async () => {
      const result = await renderer.render(mockNotification, {
        name: 'John\r\nBcc: x@example.com',
      });

      expect(result.subject).toBe('Welcome John Bcc: x@example.com');
    });

    it('should throw when the body template is missing', async () => {
      await expect(renderer.render({ ...mockNotification, bodyTemplate: '' }, {})).rejects.toThrow(
        'Body template is required',
      );
    });

    it('should throw when the subject template is missing', async () => {
      await expect(
        renderer.render({ ...mockNotification, subjectTemplate: null }, {}),
      ).rejects.toThrow('Subject template is required');
    });

    it('should throw when a template file does not exist', async () => {
      await expect(
        renderer.render({ ...mockNotification, bodyTemplate: 'non-existent.liquid' }, {}),
      ).rejects.toThrow('Failed to lookup');
      await expect(
        renderer.render({ ...mockNotification, subjectTemplate: 'non-existent.liquid' }, {}),
      ).rejects.toThrow('Failed to lookup');
    });

    it('should throw on template syntax errors', async () => {
      await expect(
        renderer.render({ ...mockNotification, bodyTemplate: 'invalid-template.liquid' }, {}),
      ).rejects.toThrow();
    });

    it('should let configureEngine register filters on both engines', async () => {
      const configureEngine = vi.fn((engine: Liquid) =>
        engine.registerFilter('shout', (value: string) => `${value}`.toUpperCase()),
      );
      renderer = new LiquidEmailTemplateRendererFactory<MockConfig>().create({ configureEngine });

      const result = await renderer.renderFromTemplateContent(
        mockNotification,
        { subject: 'Hi {{ name | shout }}', body: '<p>{{ name | shout }}</p>' },
        { name: 'John' },
      );

      expect(configureEngine).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ subject: 'Hi JOHN', body: '<p>JOHN</p>' });
    });

    it('should throw on undefined variables when strictVariables is set', async () => {
      renderer = new LiquidEmailTemplateRendererFactory<MockConfig>().create({
        root: fixturesPath,
        strictVariables: true,
      });

      await expect(renderer.render(mockNotification, {})).rejects.toThrow('undefined variable');
    });
  });

  describe('renderFromTemplateContent', () => {
    it('should render inline template content', async () => {
      const result = await renderer.renderFromTemplateContent(
        mockNotification,
        {
          subject: 'Welcome {{ name }}',
          body: '<p>Hello {{ name }}!</p>{% include "partials/footer.liquid" %}',
        },
        { name: 'John' },
      );

      expect(result.subject).toBe('Welcome John');
      expect(result.body).toContain('<p>Hello John!</p>');
      expect(result.body).toContain('<footer>Sent to John</footer>');
    });

    it('should let trusted values opt out of escaping with the raw filter', async () => {
      const result = await renderer.renderFromTemplateContent(
        mockNotification,
        { subject: 'Hi', body: '{{ html | raw }} {{ html }}' },
        { html: '<b>x</b>' },
      );

      expect(result.body).toBe('<b>x</b> &lt;b&gt;x&lt;/b&gt;');
    });

    it('should throw when subject template content is missing', async () => {
      await expect(
        renderer.renderFromTemplateContent(mockNotification, { subject: null, body: 'body' }, {}),
      ).rejects.toThrow('Subject template is required');
    });

    it('should throw on template syntax errors', async () => {
      await expect(
        renderer.renderFromTemplateContent(
          mockNotification,
          { subject: 'Hi', body: '{% if %}' },
          {},
        ),
      ).rejects.toThrow();
    });
  });

  it('should support logger injection', () => {
    const logger = createLogger();

    renderer.injectLogger(logger);

    expect(renderer.logger).toBe(logger);
  });

  it('should log the template key and error name when rendering fails', async () => {
    const logger = createLogger();
    renderer.injectLogger(logger);

    await expect(
      renderer.render({ ...mockNotification, bodyTemplate: 'invalid-template.liquid' }, {}),
    ).rejects.toThrow();

    expect(logger.error).toHaveBeenCalledWith(
      logMessageMatching(
        '[LiquidEmailTemplateRenderer] Error rendering body template invalid-template.liquid for notification 123: TokenizationError',
      ),
    );
  });

  describe('log lines never carry template content, context or error messages', () => {
    // Synthetic data, not real PHI.
    const syntheticContext = {
      name: 'Jane Synthetic',
      message: 'jane.synthetic@example.com',
      patientName: 'Jane Synthetic',
      patientEmail: 'jane.synthetic@example.com',
    };
    const forbidden = ['Jane Synthetic', 'jane.synthetic@example.com', 'patientName'];

    function expectNoSyntheticPhi(lines: string[]) {
      for (const line of lines) {
        for (const value of forbidden) {
          expect(line).not.toContain(value);
        }
      }
    }

    it('logs only ids when rendering template files', async () => {
      const logger = createLogger();
      renderer.injectLogger(logger);

      const result = await renderer.render(mockNotification, syntheticContext);

      expect(result.body).toContain('Jane Synthetic');
      expect(renderedLines(logger)).toEqual([
        '[LiquidEmailTemplateRenderer] Rendering email template for notification 123',
      ]);
    });

    it('drops the error message when a filter throws while rendering', async () => {
      const throwingRenderer = new LiquidEmailTemplateRendererFactory<MockConfig>().create({
        configureEngine: (engine) =>
          engine.registerFilter('fail', (value: string) => {
            throw new Error(`Cannot render for ${value}`);
          }),
      });
      const logger = createLogger();
      throwingRenderer.injectLogger(logger);

      const error = await throwingRenderer
        .renderFromTemplateContent(
          mockNotification,
          { subject: 'Hi', body: 'Patient {{ patientName | fail }}' },
          syntheticContext,
        )
        .catch((e: unknown) => e);

      // The thrown error does quote the context, which is why it must not be logged.
      expect((error as Error).message).toContain('Jane Synthetic');
      expect(logger.error).toHaveBeenCalledWith(
        logMessageMatching(
          '[LiquidEmailTemplateRenderer] Error rendering body template content for notification 123: RenderError',
        ),
      );
      expectNoSyntheticPhi(renderedLines(logger));
    });

    it('drops the template source quoted in syntax errors', async () => {
      const logger = createLogger();
      renderer.injectLogger(logger);

      const error = await renderer
        .renderFromTemplateContent(
          mockNotification,
          { subject: 'Hi', body: 'Patient {{ patientName }} {% if %}' },
          syntheticContext,
        )
        .catch((e: unknown) => e);

      expect((error as Error).stack).toContain('patientName');
      expectNoSyntheticPhi(renderedLines(logger));
    });

    it('drops the error message when the subject content fails to render', async () => {
      const logger = createLogger();
      renderer.injectLogger(logger);

      await expect(
        renderer.renderFromTemplateContent(
          mockNotification,
          { subject: 'Hi {{ patientName }} {% if %}', body: 'ok' },
          syntheticContext,
        ),
      ).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        logMessageMatching(
          '[LiquidEmailTemplateRenderer] Error rendering subject template content for notification 123: TokenizationError',
        ),
      );
      expectNoSyntheticPhi(renderedLines(logger));
    });
  });
});
