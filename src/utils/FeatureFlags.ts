/**
 * Feature flags system for enabling/disabling features dynamically
 * Allows for A/B testing, gradual rollouts, and feature toggles
 */

export interface FeatureFlag {
  name: string;
  enabled: boolean;
  description?: string;
  rolloutPercentage?: number;
  conditions?: FeatureFlagCondition[];
  metadata?: Record<string, any>;
}

export interface FeatureFlagCondition {
  type: 'userAgent' | 'url' | 'time' | 'random' | 'custom';
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'greaterThan' | 'lessThan' | 'between';
  value: any;
  customCheck?: () => boolean;
}

export interface FeatureFlagConfig {
  flags: FeatureFlag[];
  defaultEnabled: boolean;
  enableLocalStorage: boolean;
  enableUrlParams: boolean;
}

class FeatureFlags {
  private static flags: Map<string, FeatureFlag> = new Map();
  private static config: FeatureFlagConfig = {
    flags: [],
    defaultEnabled: false,
    enableLocalStorage: true,
    enableUrlParams: true
  };

  /**
   * Configure the feature flags system
   */
  static configure(config: Partial<FeatureFlagConfig>): void {
    this.config = { ...this.config, ...config };
    this.loadFlags();
  }

  /**
   * Register a feature flag
   */
  static register(flag: FeatureFlag): void {
    this.flags.set(flag.name, flag);
    this.saveFlags();
  }

  /**
   * Check if a feature is enabled
   */
  static isEnabled(flagName: string): boolean {
    const flag = this.flags.get(flagName);
    if (!flag) {
      return this.config.defaultEnabled;
    }

    // Check URL parameters first
    if (this.config.enableUrlParams) {
      const urlParam = this.getUrlParam(`feature_${flagName}`);
      if (urlParam !== null) {
        return urlParam === 'true' || urlParam === '1';
      }
    }

    // Check local storage
    if (this.config.enableLocalStorage) {
      const stored = localStorage.getItem(`feature_${flagName}`);
      if (stored !== null) {
        return stored === 'true';
      }
    }

    // Check rollout percentage
    if (flag.rolloutPercentage !== undefined) {
      const userHash = this.getUserHash();
      const userPercentage = (userHash % 100) / 100;
      if (userPercentage > flag.rolloutPercentage) {
        return false;
      }
    }

    // Check conditions
    if (flag.conditions && flag.conditions.length > 0) {
      const conditionsMet = flag.conditions.every(condition => 
        this.evaluateCondition(condition)
      );
      if (!conditionsMet) {
        return false;
      }
    }

    return flag.enabled;
  }

  /**
   * Enable a feature flag
   * @internal Currently unused
   */
  private static enable(flagName: string): void {
    const flag = this.flags.get(flagName);
    if (flag) {
      flag.enabled = true;
      this.saveFlags();
    }
  }

  /**
   * Disable a feature flag
   * @internal Currently unused
   */
  private static disable(flagName: string): void {
    const flag = this.flags.get(flagName);
    if (flag) {
      flag.enabled = false;
      this.saveFlags();
    }
  }

  /**
   * Toggle a feature flag
   * @internal Currently unused
   */
  private static toggle(flagName: string): boolean {
    const flag = this.flags.get(flagName);
    if (flag) {
      flag.enabled = !flag.enabled;
      this.saveFlags();
      return flag.enabled;
    }
    return false;
  }

  /**
   * Get all feature flags
   * @internal Currently unused
   */
  private static getAllFlags(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }

  /**
   * Get enabled feature flags
   * @internal Currently unused
   */
  private static getEnabledFlags(): string[] {
    return Array.from(this.flags.keys()).filter(name => this.isEnabled(name));
  }

  /**
   * Get feature flag status
   * @internal Currently unused
   */
  private static getStatus(flagName: string): {
    enabled: boolean;
    flag?: FeatureFlag;
    reason?: string;
  } {
    const flag = this.flags.get(flagName);
    if (!flag) {
      return {
        enabled: this.config.defaultEnabled,
        reason: 'Flag not found, using default'
      };
    }

    const enabled = this.isEnabled(flagName);
    return {
      enabled,
      flag,
      reason: enabled ? 'Feature enabled' : 'Feature disabled'
    };
  }

  /**
   * Clear all feature flags
   * @internal Currently unused
   */
  private static clear(): void {
    this.flags.clear();
    this.saveFlags();
  }

  /**
   * Export feature flags configuration
   * @internal Currently unused
   */
  private static export(): string {
    return JSON.stringify({
      config: this.config,
      flags: Array.from(this.flags.values()),
      enabledFlags: this.getEnabledFlags()
    }, null, 2);
  }

  /**
   * Evaluate a condition
   */
  private static evaluateCondition(condition: FeatureFlagCondition): boolean {
    switch (condition.type) {
      case 'userAgent':
        return this.evaluateStringCondition(navigator.userAgent, condition);
      
      case 'url':
        return this.evaluateStringCondition(window.location.href, condition);
      
      case 'time':
        return this.evaluateTimeCondition(new Date(), condition);
      
      case 'random':
        return this.evaluateRandomCondition(condition);
      
      case 'custom':
        return condition.customCheck ? condition.customCheck() : false;
      
      default:
        return false;
    }
  }

  /**
   * Evaluate string conditions
   */
  private static evaluateStringCondition(value: string, condition: FeatureFlagCondition): boolean {
    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      case 'contains':
        return value.includes(condition.value);
      case 'startsWith':
        return value.startsWith(condition.value);
      case 'endsWith':
        return value.endsWith(condition.value);
      default:
        return false;
    }
  }

  /**
   * Evaluate time conditions
   */
  private static evaluateTimeCondition(date: Date, condition: FeatureFlagCondition): boolean {
    const timeValue = date.getTime();
    const conditionValue = new Date(condition.value).getTime();

    switch (condition.operator) {
      case 'equals':
        return Math.abs(timeValue - conditionValue) < 24 * 60 * 60 * 1000; // Within 24 hours
      case 'greaterThan':
        return timeValue > conditionValue;
      case 'lessThan':
        return timeValue < conditionValue;
      case 'between':
        const [start, end] = condition.value;
        return timeValue >= new Date(start).getTime() && timeValue <= new Date(end).getTime();
      default:
        return false;
    }
  }

  /**
   * Evaluate random conditions
   */
  private static evaluateRandomCondition(condition: FeatureFlagCondition): boolean {
    const random = Math.random();
    return random < condition.value;
  }

  /**
   * Get URL parameter value
   */
  private static getUrlParam(name: string): string | null {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
  }

  /**
   * Get user hash for consistent rollout
   */
  private static getUserHash(): number {
    const userAgent = navigator.userAgent;
    const language = navigator.language;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const hashString = `${userAgent}-${language}-${timezone}`;
    
    let hash = 0;
    for (let i = 0; i < hashString.length; i++) {
      const char = hashString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Load flags from localStorage
   */
  private static loadFlags(): void {
    if (!this.config.enableLocalStorage) return;

    try {
      const stored = localStorage.getItem('feature_flags');
      if (stored) {
        const parsed = JSON.parse(stored);
        parsed.forEach((flag: FeatureFlag) => {
          this.flags.set(flag.name, flag);
        });
      }
    } catch (error) {
      console.warn('Failed to load feature flags from localStorage:', error);
    }
  }

  /**
   * Save flags to localStorage
   */
  private static saveFlags(): void {
    if (!this.config.enableLocalStorage) return;

    try {
      const flags = Array.from(this.flags.values());
      localStorage.setItem('feature_flags', JSON.stringify(flags));
    } catch (error) {
      console.warn('Failed to save feature flags to localStorage:', error);
    }
  }
}

// Initialise with default feature flags
FeatureFlags.configure({
  defaultEnabled: false,
  enableLocalStorage: true,
  enableUrlParams: true
});

// Register some default feature flags
FeatureFlags.register({
  name: 'lazy_loading',
  enabled: true,
  description: 'Enable lazy loading for period views',
  rolloutPercentage: 100
});

FeatureFlags.register({
  name: 'data_caching',
  enabled: true,
  description: 'Enable data caching with TTL',
  rolloutPercentage: 100
});

FeatureFlags.register({
  name: 'performance_monitoring',
  enabled: import.meta.env.DEV,
  description: 'Enable performance monitoring',
  rolloutPercentage: 50
});

FeatureFlags.register({
  name: 'advanced_logging',
  enabled: import.meta.env.DEV,
  description: 'Enable advanced logging features',
  rolloutPercentage: 25
});

export { FeatureFlags };
