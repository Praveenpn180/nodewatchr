// src/adapters/BaseAdapter.js
import { TemplateEngine } from './TemplateEngine.js';

export class BaseAdapter {
  constructor(config) {
    this.config   = config;
    this.template = config.template
      ? new TemplateEngine(config.template)
      : TemplateEngine.default();
  }

  formatText(alert) {
    // Check for rule-level template override first, then adapter-level
    const ruleTemplate = alert.rule.templates?.[this.constructor.name.toLowerCase()];
    if (ruleTemplate) return new TemplateEngine(ruleTemplate).render(alert);
    return this.template.render(alert);
  }
}