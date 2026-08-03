// Personalized lifestyle recommendations engine (rule-based clinical decision
// support). Presented as general wellness guidance, never as medical advice —
// high-risk predictions additionally direct the patient to consult a doctor.

export function buildRecommendations(inputs, riskLevel, bmi) {
  const diet = [];
  const exercise = [];
  const sleep = [];
  const lifestyle = [];
  const reminders = [];

  // 🥗 Diet
  if (inputs.ap_hi >= 130 || inputs.hypertension_dx)
    diet.push("Reduce salt (sodium) intake to help manage blood pressure — aim for under 5 g of salt per day.");
  if (inputs.gluc >= 2 || inputs.diabetes)
    diet.push("Limit added sugar and refined carbohydrates; prefer whole grains and low-glycaemic foods.");
  if (inputs.cholesterol >= 2 || inputs.high_chol_dx)
    diet.push("Cut down on saturated and trans fats; choose lean proteins, fish, nuts, and olive oil.");
  diet.push("Fill half your plate with fruits and vegetables, and choose whole grains over refined ones.");

  // 🏃 Exercise
  if (inputs.prior_heart_disease) {
    exercise.push("Because of your heart-disease history, agree an exercise programme with your doctor before increasing intensity.");
  } else if (inputs.age_years >= 65) {
    exercise.push("Aim for at least 150 minutes of gentle-to-moderate activity per week — brisk walking, swimming, or cycling are ideal at your age.");
  } else {
    exercise.push("Aim for at least 150 minutes of moderate exercise per week (about 30 minutes, 5 days a week).");
  }
  if (inputs.daily_steps < 6000)
    exercise.push(`You currently average about ${Math.round(inputs.daily_steps).toLocaleString()} steps a day — try increasing gradually toward 8,000–10,000.`);
  if (inputs.exercise_freq < 3)
    exercise.push("Build up to exercising at least 3 days per week; even short 10-minute sessions count.");

  // 😴 Sleep
  if (inputs.sleep_hours < 7)
    sleep.push(`You are sleeping about ${inputs.sleep_hours} hours a night — aim for 7–9 hours of quality sleep.`);
  else if (inputs.sleep_hours > 9)
    sleep.push("You are sleeping more than 9 hours a night; consistently long sleep can also affect heart health — keep a regular schedule.");
  else
    sleep.push("Keep up your 7–9 hours of sleep with a consistent bedtime routine.");
  if (inputs.sleep_quality <= 5)
    sleep.push("To improve sleep quality: avoid screens and caffeine late in the evening, and keep your bedroom cool and dark.");

  // 🚭 Lifestyle
  if (inputs.smoke)
    lifestyle.push("Quitting smoking is the single most effective change you can make for your heart — ask your doctor about cessation support.");
  if (inputs.alco)
    lifestyle.push("Limit alcohol consumption — no more than 1–2 standard drinks per day, with alcohol-free days each week.");
  if (inputs.stress_level >= 7)
    lifestyle.push(`Your stress level is high (${inputs.stress_level}/10) — try daily relaxation: breathing exercises, meditation, or short walks.`);
  if (bmi >= 25)
    lifestyle.push(`Your BMI is ${bmi.toFixed(1)} — gradual weight loss (0.5–1 kg per week) through diet and activity will reduce cardiovascular strain.`);
  if (!lifestyle.length)
    lifestyle.push("Maintain your current healthy habits — keep weight, stress, and alcohol in their healthy ranges.");

  // 💧 Daily reminders
  reminders.push("Drink 6–8 glasses of water spread across the day.");
  if (inputs.on_meds) reminders.push("Take your prescribed medications at the same time every day.");
  reminders.push("Get up and move for a few minutes every hour of sitting.");
  reminders.push("Schedule regular health check-ups and blood-pressure measurements.");

  // Abnormal clinical test findings warrant specialist review even when the
  // overall AI risk is not high.
  const abnormalTests = [];
  if (inputs.tmt_result === 2) abnormalTests.push("a positive treadmill (TMT) test");
  if (inputs.cac_score >= 400) abnormalTests.push(`a high coronary calcium score (${Math.round(inputs.cac_score)})`);
  else if (inputs.cac_score >= 100) abnormalTests.push(`a moderate coronary calcium score (${Math.round(inputs.cac_score)})`);
  if (inputs.lvef < 40) abnormalTests.push(`a reduced ejection fraction (${inputs.lvef}% LVEF)`);
  if (inputs.ecg_result > 0) abnormalTests.push("an abnormal ECG finding");

  let followUp = null;
  if (riskLevel === "high") {
    followUp =
      "Your AI risk assessment is HIGH. Please consult a cardiologist promptly to review these results — this tool does not replace professional medical evaluation.";
  } else if (abnormalTests.length) {
    followUp =
      `Although your overall AI risk is not high, your clinical tests show ${abnormalTests.join(", ")}. ` +
      "Please discuss these findings with a cardiologist.";
  } else if (riskLevel === "medium") {
    followUp = "Your AI risk assessment is MEDIUM. Consider discussing these results at your next doctor visit.";
  }

  return {
    diet, exercise, sleep, lifestyle, reminders,
    tests: recommendTests(inputs, riskLevel),
    follow_up: followUp,
  };
}

// 🧪 Suggest medical tests the patient should consider, based on their data.
export function recommendTests(inputs, riskLevel) {
  const tests = [];
  const notDone = inputs.tmt_result === 0;

  if (inputs.ap_hi >= 130 || inputs.ap_lo >= 85 || inputs.hypertension_dx)
    tests.push("Home blood-pressure monitoring for 7 days (morning and evening) plus a kidney function test (creatinine/eGFR) — high BP affects the kidneys.");
  if (inputs.cholesterol >= 2 || inputs.high_chol_dx)
    tests.push("Full fasting lipid profile (total, LDL, HDL cholesterol and triglycerides) to quantify cholesterol levels.");
  if (inputs.gluc >= 2 || inputs.diabetes)
    tests.push("HbA1c and fasting blood glucose to assess long-term sugar control.");
  if (riskLevel !== "low" && inputs.ecg_result === 0)
    tests.push("A 12-lead resting ECG to check the heart's electrical activity.");
  if (riskLevel === "high" && inputs.lvef >= 55)
    tests.push("A 2D Echocardiogram to assess the heart's pumping function (ejection fraction).");
  if (riskLevel === "high" && notDone && !inputs.prior_heart_disease)
    tests.push("A Treadmill Test (TMT) to check how your heart performs under exercise stress — your doctor will confirm it is safe for you.");
  if ((riskLevel !== "low" || inputs.family_history) && !inputs.cac_score)
    tests.push("A Coronary Artery Calcium (CAC) scan to measure plaque build-up — especially relevant with your risk profile.");
  if (inputs.lvef < 55)
    tests.push(`A repeat 2D Echocardiogram to follow up on your reduced ejection fraction (${inputs.lvef}%).`);
  if (inputs.resting_hr > 100 || inputs.hrv_ms < 20)
    tests.push("A 24-hour Holter monitor to record your heart rhythm through the day.");
  if (!tests.length)
    tests.push("No additional tests are indicated right now — an annual health check-up with BP, lipids and glucose is sufficient.");
  return tests;
}

// Simulated wearable-sensor reading ('wearable sensors send health data').
// Replace with a real device integration (Apple Health / Google Fit / BLE) in
// production; the API contract stays the same.
const rnd = (lo, hi, dp = 0) => +(lo + Math.random() * (hi - lo)).toFixed(dp);

export function sampleWearable() {
  const restingHr = rnd(56, 96);
  return {
    ecg_rhythm: Math.random() < 0.93 ? "Normal sinus rhythm" : "Irregular rhythm detected",
    resting_hr: restingHr,
    hrv_ms: rnd(22, 85, 1),
    ap_hi: rnd(102, 158),
    ap_lo: rnd(64, 98),
    spo2: rnd(94.5, 99.5, 1),
    resp_rate: rnd(12, 19, 1),
    body_temp: rnd(36.3, 37.2, 2),
    daily_steps: rnd(1800, 14000),
    sleep_hours: rnd(4.8, 9.2, 1),
    sleep_quality: rnd(3, 9),
    sampled_at: new Date().toISOString(),
  };
}
