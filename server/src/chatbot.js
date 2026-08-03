// Rule-based AI health assistant. Answers questions about the user's own
// results, cardiovascular risk factors, and how to use the website — with a
// safety fallback directing medical questions to professionals. Runs fully
// locally (no external AI service, no data leaves the machine).
import { mainReason } from "./serialize.js";

const T = (s) => s.toLowerCase();

export function chatReply(message, latestRecord, user) {
  const q = T(message || "").trim();
  if (!q) return "Ask me anything about your heart-risk result, the health terms in your report, or how to use this website.";

  const has = (...words) => words.some((w) => q.includes(w));

  // --- Personal results -------------------------------------------------------
  if (has("my risk", "my result", "my score", "my prediction", "am i at risk", "my report say")) {
    if (!latestRecord)
      return "You haven't taken an assessment yet. Go to **New Assessment**, fill in your health details (or sync the wearable), and I'll be able to explain your result.";
    const pct = (latestRecord.riskProbability * 100).toFixed(1);
    const reason = mainReason(latestRecord);
    return `Your latest assessment (${new Date(latestRecord.createdAt).toLocaleDateString()}) shows **${latestRecord.riskLevel.toUpperCase()} risk — ${pct}%**. ${reason || ""} ` +
      (latestRecord.riskLevel === "high"
        ? "Because this is high, please consult a cardiologist promptly. Meanwhile, check your Personalized Wellness Recommendations and the Weekly Health Plan PDF."
        : "Check the Key Contributing Factors on your dashboard to see exactly what drove it, and follow your personalized recommendations to keep improving.");
  }
  if (has("why is my risk", "reason for my", "main reason", "what caused")) {
    if (!latestRecord) return "Take an assessment first (New Assessment tab) and I can tell you the main factor behind your risk.";
    const top = (latestRecord.explanation || []).slice(0, 3);
    const list = top.map((f, i) => `${i + 1}. ${f.factor} (${f.direction === "increases_risk" ? "raises" : "lowers"} risk)`).join("  ");
    return `${mainReason(latestRecord)} Top factors: ${list}. Hover each factor on the result page to see its exact SHAP weight.`;
  }
  if (has("how to reduce", "lower my risk", "improve my", "reduce my risk", "decrease my risk")) {
    if (latestRecord?.recommendations) {
      const d = latestRecord.recommendations;
      const first = [d.diet?.[0], d.exercise?.[0], d.lifestyle?.[0]].filter(Boolean).join(" ");
      return `Based on your own data: ${first} Your full personalized plan is on the dashboard, and you can download the Weekly Health Plan PDF from your result for a day-by-day schedule.`;
    }
    return "The biggest levers are: control blood pressure (less salt), stop smoking, 150 minutes of exercise per week, 7–9 hours of sleep, and a diet based on vegetables, whole grains and lean protein. Take an assessment and I'll personalize this for you.";
  }

  // --- Medical terms ----------------------------------------------------------
  if (has("blood pressure", "ap_hi", "systolic", "diastolic", "hypertension", " bp"))
    return "Blood pressure has two numbers: systolic (pressure when the heart beats) over diastolic (pressure between beats). Normal is below 120/80 mmHg; 130–139/80–89 is stage 1 hypertension; 140/90 or higher is stage 2. Consistently high BP strains the heart and arteries — it's one of the strongest cardiovascular risk factors.";
  if (has("cholesterol", "ldl", "hdl", "lipid"))
    return "Cholesterol: LDL ('bad') deposits plaque in arteries — keep it under 130 mg/dL (total under 200). HDL ('good') removes it — above 40 is protective. High cholesterol usually has no symptoms, which is why a fasting lipid profile test matters.";
  if (has("glucose", "sugar", "diabet", "hba1c"))
    return "Blood sugar: fasting glucose under 100 mg/dL is normal, 100–125 is prediabetic, 126+ suggests diabetes. HbA1c shows your 3-month average (under 5.7% is normal). Diabetes significantly raises heart-disease risk, so sugar control protects your heart too.";
  if (has("lvef", "ejection fraction", "2d echo", "echocardiogram", "echo"))
    return "A 2D Echocardiogram is an ultrasound of the heart. Its key number, LVEF (ejection fraction), is the percentage of blood pumped out each beat — 55–70% is normal, 40–54% mildly reduced, below 40% significantly reduced and needs cardiologist review.";
  if (has("cac", "calcium score", "agatston"))
    return "A CAC (Coronary Artery Calcium) scan is a CT scan that measures calcified plaque in your heart's arteries. Score 0 = no detectable plaque; 1–99 mild; 100–399 moderate; 400+ severe with high risk. It's one of the best predictors of future heart events.";
  if (has("tmt", "treadmill", "stress test"))
    return "A Treadmill Test (TMT) records your ECG while you walk on an incline. 'Positive' means the heart showed signs of restricted blood flow under stress (possible artery blockage) — a cardiologist should evaluate it. 'Negative' is reassuring.";
  if (has("ecg", "ekg", "electrocardiogram", "st-t", "lvh"))
    return "An ECG records the heart's electrical activity. 'ST-T abnormality' can indicate strain or reduced blood supply; 'LVH' (left ventricular hypertrophy) means thickened heart muscle, often from long-standing high blood pressure. Both deserve a doctor's review.";
  if (has("shap", "contributing factor", "explanation", "explain the factors"))
    return "SHAP values show how much each of your inputs pushed the prediction up or down. Red ▲ factors raised your risk, green ▼ ones lowered it, and the bar length shows the strength. The top factor is the main reason for your result.";
  if (has("bmi", "body mass"))
    return "BMI = weight (kg) ÷ height (m)². Under 18.5 is underweight, 18.5–24.9 healthy, 25–29.9 overweight, 30+ obese. Extra weight raises blood pressure, cholesterol and diabetes risk — all heart risk factors.";
  if (has("hrv", "heart rate variability"))
    return "HRV (heart rate variability) is the variation in time between heartbeats. Higher is generally better — it reflects a well-recovered, stress-resilient heart. Low HRV (<20 ms) can signal stress or overtraining.";
  if (has("spo2", "oxygen"))
    return "SpO₂ is blood oxygen saturation measured by your wearable. 95–100% is normal; consistently below 94% is worth mentioning to a doctor.";

  // --- Lifestyle---------------------------------------------------------------
  if (has("diet", "food", "eat", "meal"))
    return "Heart-healthy eating: half your plate vegetables and fruit, whole grains over refined, lean proteins (fish, dal, chicken), minimal salt (<5 g/day), minimal added sugar, and no trans fats. Your personalized diet plan (based on your own BP/cholesterol/sugar) is in your result's recommendations and the Weekly Health Plan PDF.";
  if (has("exercise", "workout", "walk", "gym", "physical activity"))
    return "Aim for 150 minutes of moderate exercise per week — e.g. 30 minutes of brisk walking 5 days a week, plus 2 light strength sessions. If your risk is high or you have heart-disease history, confirm the plan with your doctor first. Your Weekly Health Plan PDF has a day-by-day schedule.";
  if (has("sleep"))
    return "7–9 hours of quality sleep supports heart health. Keep consistent bed/wake times, avoid screens and caffeine late, keep the room cool and dark. Your Weekly Health Plan PDF suggests a personalized bedtime based on your current sleep pattern.";
  if (has("water", "hydration", "drink"))
    return "A good rule is ~33 ml per kg of body weight per day (roughly 6–8 glasses for most people), spread across the day. Your Weekly Health Plan PDF calculates your exact daily target from your weight.";
  if (has("smok"))
    return "Quitting smoking is the single most effective thing you can do for your heart — risk starts dropping within weeks. Ask your doctor about nicotine replacement or cessation programs, and try the 4 Ds: delay, deep breathe, drink water, distract.";
  if (has("stress", "anxiety"))
    return "Chronic stress raises blood pressure and heart risk. Daily habits that help: 10 minutes of slow breathing or meditation, regular exercise, consistent sleep, and limiting caffeine. If stress feels unmanageable, consider speaking to a professional.";
  if (has("alcohol"))
    return "Keep alcohol to no more than 1–2 standard drinks per day with several alcohol-free days a week — less is better for blood pressure and heart rhythm.";

  // --- App usage ---------------------------------------------------------------
  if (has("hospital", "cardiologist near", "clinic", "emergency"))
    return "After you run an assessment, a **'Where to Go Next'** section appears with your result — it shows the right nearby care for your risk level (LOW → GP/cardiology clinics, MEDIUM → cardiology departments, HIGH → cardiac emergency centres), plus a UK cardiac centres directory. ⚠️ If you're having chest pain, severe breathlessness or fainting RIGHT NOW, call your local emergency number immediately — don't wait for the website.";
  if (has("reminder", "medication", "tablet", "notification", "pill"))
    return "On your Dashboard, use the **Medication Reminders** card: add each tablet's name and time, click 'Enable notifications', and your browser will notify you at those times (while the site is open in a tab). Reminders are saved to your account.";
  if (has("upload", "report file", "pdf report"))
    return "Go to **Upload Reports** and drag in a PDF/text report — the site automatically reads values like BP, LVEF, CAC score and cholesterol, explains what they mean, and gives diet recommendations. For scanned images, enter the values manually in New Assessment.";
  if (has("weekly plan", "health plan", "plan pdf"))
    return "After any assessment, click **'Download weekly health plan'** on the result — you'll get a PDF with a 7-day exercise schedule, meal plan, personalized bedtime and water target, all computed from your own data.";
  if (has("assessment", "predict", "check my risk", "how to use", "how does this work", "how it works"))
    return "Workflow: 1) Go to New Assessment. 2) Fill in your details or click 'Sync wearable device'. 3) Add any clinical test values (ECG, Echo, TMT, CAC). 4) Click 'Check My Risk'. You'll get your risk level, the main reason behind it, personalized recommendations, suggested tests, and a downloadable weekly health plan.";
  if (has("doctor", "clinician", "review"))
    return "Doctors on this platform can view your records and predictions, add clinical reviews and recommendations — you'll see their notes on your dashboard and in your reports.";

  // --- Small talk / meta -------------------------------------------------------
  if (has("hello", "hi", "hey", "good morning", "good evening"))
    return `Hello ${user?.fullName?.split(" ")[0] || "there"}! 👋 I can explain your risk result, decode medical terms (LVEF, CAC, TMT…), suggest lifestyle changes, or help you use the site. What would you like to know?`;
  if (has("thank"))
    return "You're welcome! Take care of your heart 🫀 — and remember, for anything urgent or clinical, a real doctor beats an AI every time.";
  if (has("who are you", "what can you"))
    return "I'm CardioAI's assistant. I can: explain your risk result and its main reason · decode terms like LVEF, CAC, SHAP · give diet/exercise/sleep guidance · point you to features (hospitals, reminders, weekly plan, uploads). I'm not a doctor and don't give medical diagnoses.";

  // --- Fallback -----------------------------------------------------------------
  return "I'm not sure about that one. I can help with: **your result** ('what is my risk?', 'why is my risk high?'), **medical terms** ('what is LVEF/CAC/TMT?'), **lifestyle** ('diet', 'exercise', 'sleep', 'water'), or **site features** ('hospitals', 'reminders', 'weekly plan', 'upload'). For medical concerns, please consult a doctor.";
}
