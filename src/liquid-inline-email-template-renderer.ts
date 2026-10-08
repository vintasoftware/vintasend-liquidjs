import type { BaseNotificationTypeConfig } from 'vintasend';
import {
  LiquidEmailTemplateRenderer,
  type LiquidTemplateRendererOptions,
} from './liquid-email-template-renderer.js';

/**
 * Renders email notifications from Liquid templates held in memory instead of on disk.
 *
 * `notification.bodyTemplate` and `notification.subjectTemplate` are keys into `templates`, which
 * is typically the JSON written by `compile-liquid-templates`. Includes, renders and layouts
 * resolve against the same map, so templates can share partials without a file system — useful in
 * environments such as Medplum bots where templates ship embedded in the bundle.
 *
 * Escaping and subject handling are the same as `LiquidEmailTemplateRenderer`.
 */
export class LiquidInlineEmailTemplateRenderer<
  Config extends BaseNotificationTypeConfig,
> extends LiquidEmailTemplateRenderer<Config> {
  protected override readonly rendererName: string = 'LiquidInlineEmailTemplateRenderer';

  constructor(
    templates: Record<string, string>,
    options: Omit<LiquidTemplateRendererOptions, 'templates'> = {},
  ) {
    super({ ...options, templates });
  }
}

export class LiquidInlineEmailTemplateRendererFactory<Config extends BaseNotificationTypeConfig> {
  create(
    templates: Record<string, string>,
    options: Omit<LiquidTemplateRendererOptions, 'templates'> = {},
  ): LiquidInlineEmailTemplateRenderer<Config> {
    return new LiquidInlineEmailTemplateRenderer<Config>(templates, options);
  }
}
