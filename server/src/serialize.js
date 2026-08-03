export function userPayload(u) {
  return {
    id: String(u._id),
    email: u.email,
    full_name: u.fullName,
    role: u.role,
    is_verified: u.isVerified,
    patient_id: u.patientId || null,
    anon_id: u.anonId || null,
    phone: u.phone || null,
    date_of_birth: u.dateOfBirth || null,
    address: u.address || null,
    medical_history: u.medicalHistory || {},
  };
}

// One-sentence statement of the single biggest factor behind the result.
export function mainReason(r) {
  const top = (r.explanation || [])[0];
  if (!top) return null;
  const increases = top.direction === "increases_risk";
  if (r.riskLevel === "high" || r.riskLevel === "medium") {
    return increases
      ? `The main reason for your ${r.riskLevel} risk is: ${top.factor}.`
      : `Your risk is ${r.riskLevel} despite ${top.factor} being in your favour — other factors are driving it up.`;
  }
  return increases
    ? `Your risk is low overall, but the factor working most against you is: ${top.factor}.`
    : `The main reason your risk is low is: ${top.factor}.`;
}

export function recordPayload(r) {
  return {
    id: String(r._id),
    created_at: r.createdAt.toISOString(),
    inputs: r.inputs,
    bmi: r.bmi,
    risk_probability: r.riskProbability,
    risk_level: r.riskLevel,
    risk_classification: r.riskClassification,
    alert_status: r.alertStatus,
    main_reason: mainReason(r),
    explanation: (r.explanation || []).map((e) => ({
      factor: e.factor,
      shap_contribution: e.shap_contribution,
      direction: e.direction,
    })),
    recommendations: r.recommendations || null,
    review_note: r.reviewNote || null,
    reviewed_at: r.reviewedAt ? r.reviewedAt.toISOString() : null,
  };
}
