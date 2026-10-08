import type { BaseLogger, ContextGenerator, DatabaseNotification } from 'vintasend';
import { logMessageMatching, renderLogMessage } from 'vintasend';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type LiquidInlineEmailTemplateRenderer,
  LiquidInlineEmailTemplateRendererFactory,
} from '../index';

type MockConfig = {
  ContextMap: { testContext: ContextGenerator };
  NotificationIdType: string;
  UserIdType: string;
};

describe('LiquidInlineEmailTemplateRenderer', () => {
  let renderer: LiquidInlineEmailTemplateRenderer<MockConfig>;
  let mockNotification: DatabaseNotification<MockConfig>;

  const templates = {
    'emails/welcome.liquid':
      '<h1>Hello {{ name }}!</h1>\n<p>Your message: {{ message }}</p>\n{% include "partials/footer.liquid" %}',
    'emails/welcome-subject.liquid': 'Welcome {{ name }}\n',
    'partials/footer.liquid': '<footer>Sent to {{ name }}</footer>',
    'emails/invalid.liquid': '{% if %}',
  };

  beforeEach(() => {
    renderer = new LiquidInlineEmailTemplateRendererFactory<MockConfig>().create(templates);
    mockNotification = {
      id: '123',
      notificationType: 'EMAIL' as const,
      contextName: 'testContext',
      contextParameters: {},
      userId: '456',
      title: 'Test Notification',
      bodyTemplate: 'emails/welcome.liquid',
      subjectTemplate: 'emails/welcome-subject.liquid',
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

  it('should render templates from the map, including partials', async () => {
    const result = await renderer.render(mockNotification, {
      name: 'John',
      message: 'Hello World',
    });

    expect(result.subject).toBe('Welcome John');
    expect(result.body).toContain('<h1>Hello John!</h1>');
    expect(result.body).toContain('<p>Your message: Hello World</p>');
    expect(result.body).toContain('<footer>Sent to John</footer>');
  });

  it('should escape context values in the body', async () => {
    const result = await renderer.render(mockNotification, { name: '<i>John</i>' });

    expect(result.subject).toBe('Welcome <i>John</i>');
    expect(result.body).toContain('<h1>Hello &lt;i&gt;John&lt;/i&gt;!</h1>');
  });

  it('should pass other Liquid options through', async () => {
    renderer = new LiquidInlineEmailTemplateRendererFactory<MockConfig>().create(templates, {
      strictVariables: true,
    });

    await expect(renderer.render(mockNotification, {})).rejects.toThrow('undefined variable');
  });

  it('should render inline template content with partials from the map', async () => {
    const result = await renderer.renderFromTemplateContent(
      mockNotification,
      { subject: 'Hi {{ name }}', body: '<p>{{ name }}</p>{% include "partials/footer.liquid" %}' },
      { name: 'John' },
    );

    expect(result).toEqual({
      subject: 'Hi John',
      body: '<p>John</p><footer>Sent to John</footer>',
    });
  });

  it('should throw when the body template key is not in the map', async () => {
    await expect(
      renderer.render({ ...mockNotification, bodyTemplate: 'non-existent-body' }, {}),
    ).rejects.toThrow('Body template "non-existent-body" not found in templates');
  });

  it('should throw when the subject template key is not in the map', async () => {
    await expect(
      renderer.render({ ...mockNotification, subjectTemplate: 'non-existent-subject' }, {}),
    ).rejects.toThrow('Subject template "non-existent-subject" not found in templates');
  });

  it('should not treat inherited object properties as template keys', async () => {
    await expect(
      renderer.render({ ...mockNotification, bodyTemplate: 'constructor' }, {}),
    ).rejects.toThrow('Body template "constructor" not found in templates');
  });

  it('should throw when bodyTemplate is empty', async () => {
    await expect(renderer.render({ ...mockNotification, bodyTemplate: '' }, {})).rejects.toThrow(
      'Body template is required',
    );
  });

  it('should throw when subjectTemplate is empty', async () => {
    await expect(renderer.render({ ...mockNotification, subjectTemplate: '' }, {})).rejects.toThrow(
      'Subject template is required',
    );
  });

  it('should create a renderer with an empty templates map', () => {
    expect(new LiquidInlineEmailTemplateRendererFactory<MockConfig>().create({})).toBeDefined();
  });

  it('should log under its own name when rendering fails', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } satisfies BaseLogger;
    renderer.injectLogger(logger);

    await expect(
      renderer.render(
        { ...mockNotification, bodyTemplate: 'emails/invalid.liquid' },
        // Synthetic data, not real PHI.
        { name: 'Jane Synthetic' },
      ),
    ).rejects.toThrow();

    expect(logger.error).toHaveBeenCalledWith(
      logMessageMatching(
        '[LiquidInlineEmailTemplateRenderer] Error rendering body template emails/invalid.liquid for notification 123: TokenizationError',
      ),
    );
    const lines = [logger.info, logger.error].flatMap((fn) =>
      fn.mock.calls.map((call) => renderLogMessage(call[0])),
    );
    for (const line of lines) {
      expect(line).not.toContain('Jane Synthetic');
    }
  });
});
