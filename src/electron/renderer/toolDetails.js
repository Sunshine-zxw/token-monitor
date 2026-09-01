'use strict';

(function exposeToolDetails(root, factory) {
  const usageAttributionRowsApi = typeof module === 'object' && module.exports
    ? require('./usageAttributionRows')
    : root?.TokenMonitorUsageAttributionRows;
  const api = factory(usageAttributionRowsApi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TokenMonitorToolDetails = api;
})(typeof window !== 'undefined' ? window : null, function createToolDetailsApi(usageAttributionRowsApi) {
  function amount(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, number) : 0;
  }

  function recentSpeedSummary(samples) {
    const valid = (Array.isArray(samples) ? samples : [])
      .map((sample) => ({
        outputTokens: amount(sample?.outputTokens),
        durationMs: amount(sample?.durationMs),
        completedAt: String(sample?.completedAt || '')
      }))
      .filter((sample) => sample.outputTokens > 0 && sample.durationMs > 0 && !Number.isNaN(Date.parse(sample.completedAt)))
      .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))
      .slice(0, 10);
    if (!valid.length) return {};
    const latest = valid[0];
    const output = valid.reduce((sum, sample) => sum + sample.outputTokens, 0);
    const duration = valid.reduce((sum, sample) => sum + sample.durationMs, 0);
    return {
      lastTokenRate: latest.outputTokens * 1000 / latest.durationMs,
      avg10TokenRate: duration > 0 ? output * 1000 / duration : 0,
      speedSampleCount: valid.length,
      lastCompletedAt: latest.completedAt
    };
  }

  function latestModelSpeedForPeriod(period, model) {
    const modelKey = String(model || '').trim();
    if (!modelKey) return {};
    let latest = null;
    for (const models of Object.values(period?.clientModelSpeedSamples || {})) {
      const summary = recentSpeedSummary(models?.[modelKey]);
      if (!(summary.lastTokenRate > 0) || !summary.lastCompletedAt) continue;
      const completedAtMs = Date.parse(summary.lastCompletedAt);
      if (!latest || completedAtMs > latest.completedAtMs) {
        latest = { ...summary, completedAtMs };
      }
    }
    if (!latest) return {};
    const { completedAtMs: _completedAtMs, ...result } = latest;
    return result;
  }

  function modelRowsForTool(period, client) {
    const clientKey = String(client || '').trim();
    if (!clientKey) return [];
    const models = period?.clientModels?.[clientKey];
    const costs = period?.clientModelCosts?.[clientKey];
    if ((!models || typeof models !== 'object') && (!costs || typeof costs !== 'object')) return [];

    const total = amount(period?.clients?.[clientKey]);
    const totalCost = amount(period?.clientCosts?.[clientKey]);
    const timedOutputs = period?.clientModelTimedOutputTokens?.[clientKey] || {};
    const timedDurations = period?.clientModelTimedDurationMs?.[clientKey] || {};
    const recentSpeeds = period?.clientModelSpeedSamples?.[clientKey] || {};
    return usageAttributionRowsApi.attributionRows(models, costs, {
      totalValue: total,
      totalCost
    })
      .map((row) => {
        const value = amount(row.value);
        const cost = amount(row.cost);
        const timedOutputTokens = amount(timedOutputs[row.key]);
        const timedDurationMs = amount(timedDurations[row.key]);
        const timing = timedDurationMs > 0
          ? {
              timedOutputTokens,
              timedDurationMs,
              tokenRate: timedOutputTokens > 0 ? timedOutputTokens * 1000 / timedDurationMs : 0
            }
          : {};
        const recentSpeed = recentSpeedSummary(recentSpeeds[row.key]);
        return {
          key: row.key,
          name: row.key,
          value,
          cost,
          percent: total > 0 ? Math.min(100, value / total * 100) : 0,
          ...timing,
          ...recentSpeed,
          unattributed: row.unattributed === true
        };
      })
      .sort((a, b) => b.value - a.value || b.cost - a.cost || a.name.localeCompare(b.name));
  }

  function visibleModelRowsForTool(period, client, formatCost) {
    return usageAttributionRowsApi.visibleAttributionRows(
      modelRowsForTool(period, client),
      formatCost
    );
  }

  function detailPercentLabel(value) {
    const percent = amount(value);
    if (percent > 0 && percent < 1) return '<1%';
    return `${Math.round(Math.min(100, percent))}%`;
  }

  function tokenInputPercentages(parts = {}) {
    const cacheRead = amount(parts.cacheRead);
    const cacheMiss = amount(parts.cacheMiss);
    const input = cacheRead + cacheMiss;
    return {
      hit: input > 0 ? cacheRead / input * 100 : 0,
      miss: input > 0 ? cacheMiss / input * 100 : 0
    };
  }

  return {
    detailPercentLabel,
    latestModelSpeedForPeriod,
    modelRowsForTool,
    tokenInputPercentages,
    visibleModelRowsForTool
  };
});
