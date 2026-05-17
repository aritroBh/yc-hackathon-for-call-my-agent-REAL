export interface ScoreWeights {
  price: number;
  lead_time: number;
  communication: number;
  reliability: number;
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  price: 0.40,
  lead_time: 0.25,
  communication: 0.15,
  reliability: 0.20,
};

export interface ScoredSupplier {
  supplier_id: string;
  supplier_name: string;
  price_score: number;
  lead_time_score: number;
  communication_score: number;
  reliability_score: number;
  composite_score: number;
  breakdown: Record<string, number>;
  extraction: any;
}

export interface ScoringContext {
  targetPrice: number | null;
  floorPrice: number | null;
  targetLeadDays: number | null;
  weights?: ScoreWeights;
}

export function computePriceScore(
  quotedPrice: number | null,
  ctx: ScoringContext,
): number {
  if (quotedPrice == null) return 0;

  const target = ctx.targetPrice;
  const floor = ctx.floorPrice;

  if (target != null && floor != null) {
    if (quotedPrice <= floor) return 100;
    if (quotedPrice >= target * 1.5) return 10;
    if (quotedPrice >= target * 1.3) return 25;
    if (quotedPrice >= target * 1.15) return 40;
    if (quotedPrice >= target * 1.05) return 55;
    if (quotedPrice >= target * 0.95) return 75;
    if (quotedPrice >= target * 0.85) return 85;
    return 95;
  }

  if (target != null) {
    const ratio = quotedPrice / target;
    if (ratio <= 0.8) return 100;
    if (ratio <= 0.9) return 85;
    if (ratio <= 1.0) return 70;
    if (ratio <= 1.1) return 50;
    if (ratio <= 1.25) return 30;
    return 10;
  }

  return 50;
}

export function computeLeadTimeScore(
  leadDays: number | null,
  ctx: ScoringContext,
): number {
  if (leadDays == null) return 30;

  const target = ctx.targetLeadDays;

  if (target != null) {
    if (leadDays <= target * 0.5) return 100;
    if (leadDays <= target * 0.75) return 85;
    if (leadDays <= target) return 70;
    if (leadDays <= target * 1.25) return 50;
    if (leadDays <= target * 1.5) return 30;
    return 10;
  }

  if (leadDays <= 7) return 95;
  if (leadDays <= 14) return 85;
  if (leadDays <= 30) return 70;
  if (leadDays <= 45) return 50;
  if (leadDays <= 60) return 30;
  return 10;
}

export function computeCommunicationScore(
  commQuality: number | null,
  negEffectiveness: number | null,
): number {
  const a = commQuality != null ? commQuality : 5;
  const b = negEffectiveness != null ? negEffectiveness : 5;
  const avg = (a + b) / 2;
  return Math.round((avg / 10) * 100);
}

export function computeReliabilityScore(
  certifications: string[],
  minOrderQty: number | null,
  quotedPrice: number | null,
  leadDays: number | null,
): number {
  let score = 40;

  if (certifications && certifications.length > 0) {
    const premiumCerts = ["ISO 9001", "ISO 14001", "ISO 22000", "FDA", "CE", "BIS", "UL", "RoHS", "REACH"];
    const matched = certifications.filter((c) =>
      premiumCerts.some((pc) => c.toUpperCase().includes(pc)),
    );
    score += Math.min(25, matched.length * 8);
  }

  if (minOrderQty != null && minOrderQty > 0) {
    score += 10;
  }

  if (quotedPrice != null && quotedPrice > 0) {
    score += 10;
  }

  if (leadDays != null && leadDays > 0) {
    score += 10;
  }

  score += 5;

  return Math.min(100, Math.max(0, score));
}

export function computeCompositeScore(
  priceScore: number,
  leadScore: number,
  commScore: number,
  relScore: number,
  weights?: ScoreWeights,
): number {
  const w = weights || DEFAULT_WEIGHTS;
  return Math.round(
    priceScore * w.price +
    leadScore * w.lead_time +
    commScore * w.communication +
    relScore * w.reliability,
  );
}

export interface RankingExplanation {
  supplier_id: string;
  supplier_name: string;
  composite_score: number;
  rank: number;
  is_recommended: boolean;
  explanation: string;
}

export function buildRankingExplanations(
  scored: ScoredSupplier[],
  weights: ScoreWeights,
): RankingExplanation[] {
  const sorted = [...scored].sort((a, b) => b.composite_score - a.composite_score);

  return sorted.map((s, i) => {
    const parts: string[] = [];
    const isRec = i === 0 && s.composite_score >= 50;

    parts.push(`Rank #${i + 1} with ${s.composite_score}/100 composite`);

    if (s.price_score >= 80) parts.push("excellent pricing");
    else if (s.price_score >= 60) parts.push("competitive pricing");
    else if (s.price_score >= 40) parts.push("moderate pricing");
    else parts.push("above-target pricing");

    if (s.lead_time_score >= 80) parts.push("fast delivery");
    else if (s.lead_time_score >= 50) parts.push("acceptable lead time");
    else parts.push("long lead time");

    if (s.communication_score >= 70) parts.push("strong communication");
    else parts.push("average communication");

    if (s.reliability_score >= 70) parts.push("high reliability signals");
    else if (s.reliability_score >= 50) parts.push("moderate reliability");
    else parts.push("limited reliability signals");

    const topScore = sorted[0]?.composite_score || 0;
    const gap = topScore - s.composite_score;
    if (i > 0 && gap > 15) parts.push(`significant gap (${gap}pts) to top supplier`);
    else if (i > 0) parts.push(`close contender (${gap}pts behind top)`);

    if (isRec) parts.push("RECOMMENDED");

    return {
      supplier_id: s.supplier_id,
      supplier_name: s.supplier_name,
      composite_score: s.composite_score,
      rank: i + 1,
      is_recommended: isRec,
      explanation: parts.join("; ") + ".",
    };
  });
}

export function scoreSupplier(
  supplierId: string,
  supplierName: string,
  extraction: any,
  ctx: ScoringContext,
): ScoredSupplier {
  const priceScore = computePriceScore(extraction.quoted_price, ctx);
  const leadScore = computeLeadTimeScore(extraction.lead_time_days, ctx);
  const commScore = computeCommunicationScore(
    extraction.communication_quality,
    extraction.negotiation_effectiveness,
  );
  const relScore = computeReliabilityScore(
    extraction.certifications,
    extraction.minimum_order_quantity,
    extraction.quoted_price,
    extraction.lead_time_days,
  );
  const composite = computeCompositeScore(priceScore, leadScore, commScore, relScore, ctx.weights);

  const w = ctx.weights || DEFAULT_WEIGHTS;

  return {
    supplier_id: supplierId,
    supplier_name: supplierName,
    price_score: priceScore,
    lead_time_score: leadScore,
    communication_score: commScore,
    reliability_score: relScore,
    composite_score: composite,
    breakdown: {
      price_weighted: Math.round(priceScore * w.price),
      lead_time_weighted: Math.round(leadScore * w.lead_time),
      communication_weighted: Math.round(commScore * w.communication),
      reliability_weighted: Math.round(relScore * w.reliability),
    },
    extraction,
  };
}
