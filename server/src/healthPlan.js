// Personalized weekly health plan: 7-day exercise schedule, diet plan, sleep
// schedule and water intake, derived from the patient's own assessment data.
// Rendered as a downloadable PDF (general wellness guidance, not medical advice).
import PDFDocument from "pdfkit";
import { mainReason } from "./serialize.js";

export function buildWeeklyPlan(record) {
  const x = record.inputs;
  const riskLevel = record.riskLevel;

  // 💧 Water: ~33 ml/kg body weight, nudged up for activity, capped sensibly.
  const waterL = Math.min(Math.max((x.weight_kg * 0.033) + (x.daily_steps > 9000 ? 0.4 : 0), 1.8), 3.5);
  const glasses = Math.round((waterL * 1000) / 250);

  // 😴 Sleep: target 7.5h inside 7–9; propose a schedule shifted from their habit.
  const target = x.sleep_hours < 7 ? 7.5 : x.sleep_hours > 9 ? 8 : Math.max(7, Math.min(9, x.sleep_hours));
  const wake = 6.5; // 06:30 wake-up anchor
  let bed = wake + 24 - target;
  const fmt = (h) => {
    const hh = Math.floor(h % 24), mm = Math.round((h % 1) * 60);
    const ampm = hh >= 12 ? "PM" : "AM";
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
  };
  const sleep = {
    bedtime: fmt(bed),
    wake_time: fmt(wake),
    target_hours: target,
    notes: [
      x.sleep_hours < 7
        ? `You currently sleep ~${x.sleep_hours}h. Move bedtime 20–30 minutes earlier each week until you reach ${target}h.`
        : x.sleep_hours > 9
          ? `You currently sleep ~${x.sleep_hours}h — long sleep is also linked to heart risk. Anchor your wake time at ${fmt(wake)} daily.`
          : `Your ${x.sleep_hours}h is in the healthy range — keep it consistent, including weekends.`,
      x.stress_level >= 7 ? "10 minutes of slow breathing or meditation before bed will help with your high stress level." : "No screens for the last 30 minutes before bed.",
    ],
  };

  // 🏃 Exercise week: intensity scaled by risk, age, history.
  const gentle = riskLevel === "high" || x.prior_heart_disease || x.age_years >= 65 || x.lvef < 50;
  const walk = gentle ? "20–30 min easy-pace walk" : "30–40 min brisk walk";
  const cardio = gentle ? "20 min light cycling or swimming (talk-test pace)" : "30 min cycling, swimming or jogging";
  const strength = gentle ? "15 min light resistance (bands, light weights), avoid straining" : "25 min strength training (bodyweight or weights)";
  const days = [
    { day: "Monday", plan: walk, extra: "5 min stretching after" },
    { day: "Tuesday", plan: strength, extra: "Focus on legs & core" },
    { day: "Wednesday", plan: cardio, extra: "Keep a pace where you can still talk" },
    { day: "Thursday", plan: `Rest or ${gentle ? "gentle yoga / stretching" : "yoga or mobility work"}`, extra: "Active recovery" },
    { day: "Friday", plan: walk, extra: "Try a different route to stay motivated" },
    { day: "Saturday", plan: strength, extra: "Upper body & back" },
    { day: "Sunday", plan: "Long easy walk with family/friends (45–60 min)", extra: "Recovery pace" },
  ];
  const exerciseNotes = [];
  if (x.prior_heart_disease || riskLevel === "high")
    exerciseNotes.push("Given your risk profile, confirm this plan with your doctor before starting, and stop immediately if you feel chest pain, dizziness or unusual breathlessness.");
  if (x.daily_steps < 6000)
    exerciseNotes.push(`Daily step goal: increase from ~${Math.round(x.daily_steps).toLocaleString()} to ${Math.round(Math.min(x.daily_steps + 2000, 10000)).toLocaleString()} steps this week, then +1,000/week toward 10,000.`);

  // 🥗 Diet plan tuned to their findings.
  const highBp = x.ap_hi >= 130 || x.hypertension_dx;
  const highChol = x.cholesterol >= 2 || x.high_chol_dx;
  const highSugar = x.gluc >= 2 || x.diabetes;
  const diet = {
    breakfast: highSugar
      ? "Vegetable oats/upma or eggs with whole-grain toast — no sugar in tea/coffee, no fruit juice."
      : "Oats or idli/poha with vegetables, plus one whole fruit.",
    lunch: `Half plate vegetables/salad, quarter plate whole grains (brown rice/roti), quarter plate protein (dal, fish, chicken or paneer)${highBp ? " — cooked with minimal salt" : ""}.`,
    dinner: "Light and early (finish 2–3 hours before bed): grilled/steamed protein with vegetables; avoid fried items.",
    snacks: highChol
      ? "A small handful (25–30 g) of unsalted nuts, roasted chana, or fruit — no biscuits, namkeen or fried snacks."
      : "Fruit, sprouts, yogurt or a handful of nuts.",
    rules: [
      highBp ? "Salt under 5 g/day: no pickles/papad/processed foods, don't add salt at the table." : null,
      highChol ? "Use minimal oil (2–3 tsp/day); prefer olive, mustard or rice-bran oil; oats/beans daily for soluble fibre." : null,
      highSugar ? "No sugary drinks or sweets; whole fruit instead of juice; carbs spread evenly across meals." : null,
      x.alco ? "Alcohol: maximum 1–2 drinks, only 1–2 days this week — try a fully dry week." : null,
      "Eat slowly, stop at 80% full; use a smaller plate to control portions.",
    ].filter(Boolean),
  };

  return {
    generated_at: new Date().toISOString(),
    risk_level: riskLevel,
    risk_probability: record.riskProbability,
    main_reason: mainReason(record),
    water: {
      litres_per_day: +waterL.toFixed(1),
      glasses_per_day: glasses,
      note: `About ${waterL.toFixed(1)} L (${glasses} glasses of 250 ml) spread across the day — based on your ${x.weight_kg} kg body weight. Sip regularly; don't wait until you're thirsty.`,
    },
    sleep,
    exercise: { days, notes: exerciseNotes },
    diet,
    tests: record.recommendations?.tests || [],
  };
}

export function buildPlanPdf(record, patient) {
  const plan = buildWeeklyPlan(record);
  const doc = new PDFDocument({ margin: 46, size: "A4" });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const H = (txt) => { doc.moveDown(0.6).fontSize(13).fillColor("#0f172a").font("Helvetica-Bold").text(txt); doc.moveDown(0.2); };
  const P = (txt, opts = {}) => doc.fontSize(10.5).fillColor("#334155").font("Helvetica").text(txt, opts);
  const LI = (txt) => P(`•  ${txt}`, { indent: 6 });

  doc.fontSize(18).font("Helvetica-Bold").fillColor("#0f172a").text("Personalized Weekly Health Plan");
  doc.fontSize(10).font("Helvetica").fillColor("#64748b")
    .text(`${patient.fullName}  ·  Generated ${new Date().toLocaleDateString()}  ·  Based on assessment of ${new Date(record.createdAt).toLocaleDateString()}`);
  doc.moveDown(0.5);

  const high = plan.risk_level === "high";
  doc.fontSize(12).font("Helvetica-Bold")
    .fillColor(high ? "#dc2626" : plan.risk_level === "medium" ? "#d97706" : "#16a34a")
    .text(`Risk level: ${plan.risk_level.toUpperCase()} (${(plan.risk_probability * 100).toFixed(1)}%)`);
  if (plan.main_reason) { doc.moveDown(0.2); doc.fontSize(10.5).font("Helvetica-Bold").fillColor("#334155").text(plan.main_reason); }

  H("Exercise — your 7-day schedule");
  for (const d of plan.exercise.days) {
    doc.fontSize(10.5).font("Helvetica-Bold").fillColor("#0f172a").text(`${d.day}: `, { continued: true });
    doc.font("Helvetica").fillColor("#334155").text(`${d.plan}  (${d.extra})`);
  }
  for (const n of plan.exercise.notes) { doc.moveDown(0.2); LI(n); }

  H("Diet plan");
  doc.fontSize(10.5).font("Helvetica-Bold").fillColor("#0f172a").text("Breakfast: ", { continued: true });
  doc.font("Helvetica").fillColor("#334155").text(plan.diet.breakfast);
  doc.font("Helvetica-Bold").fillColor("#0f172a").text("Lunch: ", { continued: true });
  doc.font("Helvetica").fillColor("#334155").text(plan.diet.lunch);
  doc.font("Helvetica-Bold").fillColor("#0f172a").text("Dinner: ", { continued: true });
  doc.font("Helvetica").fillColor("#334155").text(plan.diet.dinner);
  doc.font("Helvetica-Bold").fillColor("#0f172a").text("Snacks: ", { continued: true });
  doc.font("Helvetica").fillColor("#334155").text(plan.diet.snacks);
  doc.moveDown(0.2);
  for (const r of plan.diet.rules) LI(r);

  H("Sleep schedule");
  P(`Bedtime ${plan.sleep.bedtime} → Wake ${plan.sleep.wake_time}  (target ${plan.sleep.target_hours} hours)`);
  for (const n of plan.sleep.notes) LI(n);

  H("Water intake");
  P(plan.water.note);

  if (plan.tests.length) {
    H("Tests worth discussing with your doctor");
    for (const t of plan.tests) LI(t);
  }

  doc.moveDown(0.8);
  doc.fontSize(9).font("Helvetica-Oblique").fillColor("#94a3b8").text(
    "This weekly plan is general wellness guidance generated from your health assessment. " +
    "It does not replace professional medical advice. " +
    (high ? "Because your risk level is HIGH, please consult a cardiologist promptly." : "")
  );

  doc.end();
  return done;
}
