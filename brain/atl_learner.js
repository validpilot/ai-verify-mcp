'use strict';

const { patternStore } = require('./pattern_store');
const { classifyError, ERROR_PATTERNS } = require('./error_aggregator');

const LOG_LIKELIHOOD_THRESHOLD = 2.0;
const MIN_MATCH_SCORE = 0.3;

function computeSimilarity(str1, str2) {
  const s1 = String(str1 || '').toLowerCase();
  const s2 = String(str2 || '').toLowerCase();
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;
  
  const maxLen = Math.max(s1.length, s2.length);
  let matches = 0;
  const len1 = s1.length;
  const len2 = s2.length;
  
  for (let i = 0; i < len1; i++) {
    if (s2.includes(s1[i])) matches++;
  }
  for (let i = 0; i < len2; i++) {
    if (s1.includes(s2[i])) matches++;
  }
  
  return matches / (len1 + len2);
}

function computeTextSimilarity(text1, text2) {
  const words1 = String(text1 || '').toLowerCase().split(/\W+/).filter(w => w.length >= 3);
  const words2 = String(text2 || '').toLowerCase().split(/\W+/).filter(w => w.length >= 3);
  
  if (words1.length === 0 || words2.length === 0) return 0.0;
  
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  
  let intersection = 0;
  for (const word of set1) {
    if (set2.has(word)) intersection++;
  }
  
  const union = set1.size + set2.size - intersection;
  return union > 0 ? intersection / union : 0.0;
}

function calculateLikelihoodScore(pattern, errorEvidence) {
  let score = (pattern.score || 1.0);
  let matchDetails = [];
  
  const errorText = errorEvidence.text || errorEvidence.message || errorEvidence.body || '';
  const errorUrl = errorEvidence.url || '';
  const errorStatus = errorEvidence.status;
  
  if (pattern.symptom) {
    const symptomSim = computeTextSimilarity(pattern.symptom, errorText);
    if (symptomSim > 0.15) {
      score += symptomSim * 1.5;
      matchDetails.push(`症状匹配: ${(symptomSim * 100).toFixed(0)}%`);
    }
  }
  
  if (errorStatus && pattern.tags) {
    const statusTag = String(errorStatus);
    if (pattern.tags.includes(statusTag)) {
      score += 1.5;
      matchDetails.push(`状态码匹配: ${errorStatus}`);
    }
  }
  
  if (pattern.tags) {
    let tagMatches = 0;
    for (const tag of pattern.tags) {
      if (errorText.toLowerCase().includes(tag.toLowerCase()) || 
          errorUrl.toLowerCase().includes(tag.toLowerCase())) {
        tagMatches++;
        matchDetails.push(`标签匹配: ${tag}`);
      }
    }
    score += tagMatches * 0.3;
  }
  
  const classification = classifyError(errorEvidence);
  if (classification && pattern.rootCause) {
    const causeSim = computeTextSimilarity(classification.category, pattern.rootCause);
    score += causeSim * 0.8;
  }
  
  return { score, matchDetails };
}

function computeLogLikelihoodRatio(pattern, errorEvidence) {
  const { score, matchDetails } = calculateLikelihoodScore(pattern, errorEvidence);
  
  const basePrior = 1.0 / patternStore.length;
  const priorBoost = Math.min(0.2, score * 0.1);
  const prior = Math.min(0.5, basePrior + priorBoost);
  
  const normalizedScore = Math.max(0.01, Math.min(1.0, score / 5.0));
  const likelihood = Math.min(0.99, Math.max(0.01, normalizedScore));
  
  const logLikelihood = Math.log(likelihood / (1 - likelihood));
  const logPrior = Math.log(prior / (1 - prior));
  
  const posteriorOdds = Math.exp(logLikelihood + logPrior);
  const probability = posteriorOdds / (1 + posteriorOdds);
  
  return {
    patternId: pattern.id,
    title: pattern.title,
    score,
    logLikelihood,
    logPrior,
    probability: Math.round(probability * 100) / 100,
    matchDetails,
    rootCause: pattern.rootCause,
    fix: pattern.fix,
    tags: pattern.tags,
    source: pattern.source
  };
}

function learnFromError(errorEvidence) {
  const results = [];
  
  for (const pattern of patternStore) {
    const result = computeLogLikelihoodRatio(pattern, errorEvidence);
    if (result.score >= MIN_MATCH_SCORE) {
      results.push(result);
    }
  }
  
  results.sort((a, b) => b.score - a.score);
  
  return {
    errorSignature: String(errorEvidence.text || errorEvidence.message || '').slice(0, 100),
    totalPatterns: patternStore.length,
    matchedPatterns: results.length,
    topMatches: results.slice(0, 5),
    highConfidenceMatches: results.filter(r => r.probability >= 0.6),
    recommendedFix: results[0]?.fix || null,
    recommendedRootCause: results[0]?.rootCause || null,
    hasHighConfidence: results.some(r => r.probability >= 0.7)
  };
}

function learnFromErrors(errorList) {
  const allResults = [];
  const errorGroups = {};
  
  for (const error of errorList) {
    const signature = String(error.text || error.message || '').slice(0, 80);
    if (!errorGroups[signature]) {
      errorGroups[signature] = [];
    }
    errorGroups[signature].push(error);
  }
  
  for (const [signature, errors] of Object.entries(errorGroups)) {
    const representativeError = errors[0];
    const result = learnFromError(representativeError);
    result.errorCount = errors.length;
    result.allErrors = errors;
    allResults.push(result);
  }
  
  allResults.sort((a, b) => {
    if (a.hasHighConfidence !== b.hasHighConfidence) {
      return a.hasHighConfidence ? -1 : 1;
    }
    return b.score - a.score;
  });
  
  return {
    totalErrorGroups: allResults.length,
    highConfidenceCount: allResults.filter(r => r.hasHighConfidence).length,
    results: allResults,
    summary: generateLearningSummary(allResults)
  };
}

function generateLearningSummary(results) {
  const summaries = [];
  
  for (const result of results) {
    if (result.hasHighConfidence && result.recommendedFix) {
      summaries.push({
        level: 'high',
        signature: result.errorSignature,
        rootCause: result.recommendedRootCause,
        fix: result.recommendedFix,
        confidence: result.topMatches[0]?.probability || 0
      });
    } else if (result.topMatches.length > 0) {
      summaries.push({
        level: 'medium',
        signature: result.errorSignature,
        possibleCauses: result.topMatches.slice(0, 3).map(m => m.rootCause),
        confidence: result.topMatches[0]?.probability || 0
      });
    }
  }
  
  return summaries;
}

function suggestFixes(errorEvidence) {
  const learningResult = learnFromError(errorEvidence);
  
  const fixes = [];
  
  for (const match of learningResult.topMatches) {
    if (match.probability >= 0.5) {
      fixes.push({
        patternId: match.patternId,
        title: match.title,
        rootCause: match.rootCause,
        fix: match.fix,
        confidence: match.probability,
        matchDetails: match.matchDetails,
        tags: match.tags
      });
    }
  }
  
  if (fixes.length === 0) {
    const classification = classifyError(errorEvidence);
    if (classification) {
      fixes.push({
        patternId: 'error-classification',
        title: '基于错误分类的建议',
        rootCause: classification.affectedTarget,
        fix: classification.suggestion,
        confidence: 0.3,
        matchDetails: [`错误分类: ${classification.category}`],
        tags: [classification.category]
      });
    }
  }
  
  return {
    errorSignature: learningResult.errorSignature,
    fixes,
    hasHighConfidenceFix: fixes.some(f => f.confidence >= 0.7),
    recommendedFix: fixes[0] || null
  };
}

module.exports = {
  learnFromError,
  learnFromErrors,
  suggestFixes,
  computeLogLikelihoodRatio,
  calculateLikelihoodScore,
  LOG_LIKELIHOOD_THRESHOLD
};