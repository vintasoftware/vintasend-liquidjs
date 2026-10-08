import type { BaseNotificationTypeConfig } from 'vintasend';
import {
  LiquidEmailTemplateRenderer,
  type LiquidTemplateRendererOptions,
} from './liquid-email-template-renderer.js';

/**
 * Renders SMS notifications from Liquid templates, for SMS adapters such as
 * `vintasend-ts-twilio`, which send the rendered `body`.
 *
 * Templates resolve the same way as in `LiquidEmailTemplateRenderer`: paths under `options.root`,
 * or keys into `options.templates` for templates held in memory (e.g. in Medplum bots).
 *
 * Differences from the email renderer:
 * - Output is not HTML-escaped, since an SMS is plain text (`Tom & Jerry` stays as is). Passing
 *   `outputEscape` still overrides this.
 * - The subject template is optional; without one, `subject` is an empty string.
 * - Leading and trailing whitespace is trimmed from the body, including the trailing newline of a
 *   template file. Line breaks inside the message are kept.
 */
export class LiquidSmsTemplateRenderer<
  Config extends BaseNotificationTypeConfig,
> extends LiquidEmailTemplateRenderer<Config> {
  protected override readonly rendererName: string = 'LiquidSmsTemplateRenderer';
  protected override readonly templateKind: string = 'SMS';
  protected override readonly subjectRequired: boolean = false;

  constructor(options: LiquidTemplateRendererOptions = {}) {
    super({ outputEscape: undefined, ...options });
  }

  protected override normalizeBody(body: string): string {
    return body.trim();
  }
}

export class LiquidSmsTemplateRendererFactory<Config extends BaseNotificationTypeConfig> {
  create(options: LiquidTemplateRendererOptions = {}): LiquidSmsTemplateRenderer<Config> {
    return new LiquidSmsTemplateRenderer<Config>(options);
  }
}
