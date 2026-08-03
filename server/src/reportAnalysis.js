// Automatic analysis of uploaded medical reports (ECG / 2D Echo / TMT / CAC /
// lab reports). Extracts text from the file, finds common clinical values with
// pattern matching, and produces a plain-English explanation plus diet
// recommendations. Works on text-based PDFs, TXT, CSV and XML files; scanned
// images (PNG/JPG/DICOM) have no embedded text and are flagged as unreadable.
import { readFileSync } from "node:fs";
import { PDFParse } from "pdf-parse";

export async function analyzeReport(filePath, ext) {
  let text = null;
  try {
    if (ext === ".pdf") {
      const parser = new PDFParse({ data: new Uint8Array(readFileSync(filePath)) });
      const result = await parser.getText();
      text = result.text;
      await parser.destroy?.();
    } else if ([".txt", ".csv", ".xml"].includes(ext)) {
      text = readFileSync(filePath, "utf8");
    }
  } catch {
    text = null;
  }

  if (!text || text.trim().length < 20) {
    return {
      status: "unreadable",
      message:
        "No readable text found in this file. Automatic analysis works on text-based " +
        "PDF, TXT, CSV and XML reports; scanned images need the values entered manually " +
        "in New Assessment.",
    };
  }

  const findings = parseFindings(text);
  if (Object.keys(findings).length === 0) {
    return {
      status: "no_findings",
      message:
        "The file was read, but no recognizable clinical values (BP, LVEF, CAC score, " +
        "cholesterol, glucose, TMT/ECG findings) were detected. You can enter the values " +
        "manually in New Assessment.",
    };
  }

  return {
    status: "ok",
    findings,
    explanation: explainFindings(findings),
    diet: dietAdvice(findings),
    consult_cardiologist: needsCardiologist(findings),
  };
}

function parseFindings(text) {
  const f = {};
  let m;

  if ((m = text.match(/(?:LVEF|ejection\s+fraction|\bEF\b)\s*[:\-]?\s*(\d{2})\s*%/i)))
    f.lvef = +m[1];

  if ((m = text.match(/(?:agatston|CAC|calcium\s+scor\w*)[^\d]{0,25}(\d{1,4})/i)))
    f.cac_score = +m[1];

  if ((m = text.match(/(?:BP|blood\s+pressure)[^\d]{0,15}(\d{2,3})\s*\/\s*(\d{2,3})/i))) {
    const [hi, lo] = [+m[1], +m[2]];
    if (hi >= 80 && hi <= 250 && lo >= 40 && lo <= 150) { f.ap_hi = hi; f.ap_lo = lo; }
  }

  if ((m = text.match(/(?:total\s+)?cholesterol[^\d]{0,15}(\d{2,3})\s*(?:mg\s*\/?\s*dl)?/i)))
    f.total_cholesterol = +m[1];
  if ((m = text.match(/\bLDL\b[^\d]{0,15}(\d{2,3})/i))) f.ldl = +m[1];
  if ((m = text.match(/\bHDL\b[^\d]{0,15}(\d{2,3})/i))) f.hdl = +m[1];

  if ((m = text.match(/(?:fasting\s+)?glucose[^\d]{0,15}(\d{2,3})/i))) f.glucose = +m[1];
  if ((m = text.match(/hba1c[^\d]{0,10}(\d{1,2}(?:\.\d)?)\s*%?/i))) f.hba1c = +m[1];

  if ((m = text.match(/(?:heart\s+rate|\bHR\b|pulse)[^\d]{0,15}(\d{2,3})\s*(?:bpm)?/i))) {
    if (+m[1] >= 30 && +m[1] <= 220) f.heart_rate = +m[1];
  }

  if ((m = text.match(/(?:TMT|treadmill|stress\s+test)[^.]{0,80}?\b(positive|negative)\b/i)))
    f.tmt = m[1].toLowerCase();

  if (/ST[-\s]?T\s+(?:wave\s+)?(?:changes|abnormal)/i.test(text)) f.ecg = "st_t_abnormality";
  else if (/left\s+ventricular\s+hypertrophy|\bLVH\b/i.test(text)) f.ecg = "lvh";
  else if (/normal\s+sinus\s+rhythm/i.test(text)) f.ecg = "normal";

  return f;
}

function explainFindings(f) {
  const out = [];
  if (f.lvef != null) {
    out.push(
      f.lvef >= 55
        ? `Ejection fraction (LVEF) ${f.lvef}% — within the normal range (55–70%). The heart's pumping function looks normal.`
        : f.lvef >= 40
          ? `Ejection fraction (LVEF) ${f.lvef}% — mildly reduced (normal is 55–70%). The heart is pumping slightly less efficiently than normal.`
          : `Ejection fraction (LVEF) ${f.lvef}% — significantly reduced (normal is 55–70%). This indicates weakened pumping function and should be reviewed by a cardiologist.`
    );
  }
  if (f.cac_score != null) {
    out.push(
      f.cac_score === 0
        ? "Coronary calcium (CAC) score 0 — no detectable calcified plaque in the coronary arteries."
        : f.cac_score < 100
          ? `CAC score ${f.cac_score} — mild plaque burden. Some early calcification is present.`
          : f.cac_score < 400
            ? `CAC score ${f.cac_score} — moderate plaque burden, associated with elevated cardiovascular risk.`
            : `CAC score ${f.cac_score} — severe plaque burden (≥400), associated with high cardiovascular risk. A cardiologist review is strongly advised.`
    );
  }
  if (f.ap_hi != null) {
    const s = f.ap_hi, d = f.ap_lo;
    out.push(
      s >= 140 || d >= 90
        ? `Blood pressure ${s}/${d} mmHg — in the stage 2 hypertension range (≥140/90).`
        : s >= 130 || d >= 80
          ? `Blood pressure ${s}/${d} mmHg — in the stage 1 hypertension range (130–139/80–89).`
          : s >= 120
            ? `Blood pressure ${s}/${d} mmHg — elevated (normal is below 120/80).`
            : `Blood pressure ${s}/${d} mmHg — within the normal range.`
    );
  }
  if (f.total_cholesterol != null) {
    out.push(
      f.total_cholesterol >= 240
        ? `Total cholesterol ${f.total_cholesterol} mg/dL — high (≥240). This raises cardiovascular risk.`
        : f.total_cholesterol >= 200
          ? `Total cholesterol ${f.total_cholesterol} mg/dL — borderline high (200–239).`
          : `Total cholesterol ${f.total_cholesterol} mg/dL — within the desirable range (<200).`
    );
  }
  if (f.ldl != null)
    out.push(f.ldl >= 160 ? `LDL ("bad") cholesterol ${f.ldl} mg/dL — high (≥160).`
      : f.ldl >= 130 ? `LDL cholesterol ${f.ldl} mg/dL — borderline high (130–159).`
      : `LDL cholesterol ${f.ldl} mg/dL — within the recommended range (<130).`);
  if (f.hdl != null)
    out.push(f.hdl < 40 ? `HDL ("good") cholesterol ${f.hdl} mg/dL — low (<40); higher values are protective.`
      : `HDL cholesterol ${f.hdl} mg/dL — in a healthy range.`);
  if (f.glucose != null)
    out.push(f.glucose >= 126 ? `Fasting glucose ${f.glucose} mg/dL — in the diabetic range (≥126).`
      : f.glucose >= 100 ? `Fasting glucose ${f.glucose} mg/dL — in the prediabetic range (100–125).`
      : `Fasting glucose ${f.glucose} mg/dL — normal (<100).`);
  if (f.hba1c != null)
    out.push(f.hba1c >= 6.5 ? `HbA1c ${f.hba1c}% — in the diabetic range (≥6.5%).`
      : f.hba1c >= 5.7 ? `HbA1c ${f.hba1c}% — in the prediabetic range (5.7–6.4%).`
      : `HbA1c ${f.hba1c}% — normal (<5.7%).`);
  if (f.heart_rate != null)
    out.push(f.heart_rate > 100 ? `Heart rate ${f.heart_rate} bpm — above the normal resting range (60–100).`
      : f.heart_rate < 60 ? `Heart rate ${f.heart_rate} bpm — below 60; common in fit individuals but worth noting.`
      : `Heart rate ${f.heart_rate} bpm — within the normal resting range (60–100).`);
  if (f.tmt)
    out.push(f.tmt === "positive"
      ? "Treadmill test (TMT) — POSITIVE for inducible ischemia: the heart showed signs of restricted blood flow under exercise stress. A cardiologist should review this."
      : "Treadmill test (TMT) — negative: no signs of exercise-induced ischemia.");
  if (f.ecg)
    out.push(f.ecg === "st_t_abnormality"
      ? "ECG — ST-T wave abnormality detected, which can indicate strain or reduced blood supply to the heart muscle."
      : f.ecg === "lvh"
        ? "ECG — left ventricular hypertrophy (thickened heart muscle), often related to long-standing high blood pressure."
        : "ECG — normal sinus rhythm.");
  return out;
}

function dietAdvice(f) {
  const diet = [];
  const highBp = f.ap_hi >= 130 || f.ap_lo >= 80 || f.ecg === "lvh";
  const highChol = f.total_cholesterol >= 200 || f.ldl >= 130 || (f.cac_score ?? 0) > 0;
  const highSugar = f.glucose >= 100 || f.hba1c >= 5.7;
  const lowEf = f.lvef != null && f.lvef < 40;

  if (highBp) {
    diet.push("Cut sodium to under 1,500–2,000 mg/day: avoid pickles, papads, processed and canned foods, and don't add salt at the table (DASH-style eating).");
    diet.push("Add potassium-rich foods — bananas, spinach, beans, coconut water — which help counteract sodium's effect on blood pressure.");
  }
  if (highChol) {
    diet.push("Reduce saturated fats (butter, ghee, fried food, fatty red meat) and avoid trans fats entirely; cook with small amounts of olive/mustard/rice-bran oil.");
    diet.push("Eat soluble fibre daily — oats, barley, beans, lentils — and 25–30 g of nuts; fibre actively lowers LDL cholesterol.");
    diet.push("Have fatty fish (or flax/chia seeds if vegetarian) twice a week for omega-3s.");
  }
  if (highSugar) {
    diet.push("Cut added sugar: sweets, sugary drinks, fruit juices and refined flour; choose whole grains and whole fruit instead.");
    diet.push("Spread carbohydrates evenly across meals and pair them with protein or fibre to blunt glucose spikes.");
  }
  if (lowEf) {
    diet.push("With a reduced ejection fraction, keep sodium strictly low and ask your cardiologist about a daily fluid limit.");
  }
  diet.push("Base every meal on vegetables, fruits, whole grains and lean proteins (fish, skinless poultry, dal, tofu); limit portions to maintain a healthy weight.");
  return diet;
}

function needsCardiologist(f) {
  return Boolean(
    (f.lvef != null && f.lvef < 40) ||
    (f.cac_score != null && f.cac_score >= 400) ||
    f.tmt === "positive" ||
    f.ecg === "st_t_abnormality" ||
    (f.ap_hi != null && f.ap_hi >= 180)
  );
}
