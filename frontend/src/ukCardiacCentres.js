// Curated UK cardiac centre directory shown on the Hospitals page.
// Grouped by region; `emergency: true` marks centres suitable for urgent
// cardiac care (highlighted when the patient's risk tier is high).
const g = (name) => ({
  directions: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`,
  website: `https://www.google.com/search?q=${encodeURIComponent(name + " NHS website")}`,
});

export const UK_CARDIAC_CENTRES = [
  {
    region: "Bedford & nearby",
    entries: [
      { name: "Cardiology Department, Bedford Hospital", rating: 5, type: "Hospital department", blurb: "Cardiology services, investigations, coronary care facilities.", operator: "Bedfordshire Hospitals NHS Trust", ...g("Cardiology Department Bedford Hospital") },
      { name: "Bedford Cardiology", rating: 5, type: "Medical clinic", blurb: "Cardiac investigations, stents, pacemaker-related services.", operator: "Bedford Cardiology", ...g("Bedford Cardiology") },
      { name: "Bedford Hospital South Wing", rating: 3.3, type: "Government hospital", emergency: true, blurb: "Emergency department and hospital cardiac care.", operator: "Bedfordshire Hospitals NHS Trust", ...g("Bedford Hospital South Wing") },
      { name: "Luton and Dunstable University Hospital", type: "University hospital", emergency: true, blurb: "Cardiac centre and acute cardiac services.", operator: "Bedfordshire Hospitals NHS Trust", ...g("Luton and Dunstable University Hospital") },
      { name: "Royal Papworth Hospital", type: "Specialist heart & lung hospital", blurb: "Specialist heart and lung hospital (useful referral centre from the Bedford area).", ...g("Royal Papworth Hospital") },
    ],
  },
  {
    region: "London — major cardiac centres",
    entries: [
      { name: "Barts Heart Centre", type: "Specialist cardiac centre", emergency: true, blurb: "One of the largest cardiac centres in the UK, treating complex heart conditions.", operator: "Barts Health NHS Trust", ...g("Barts Heart Centre London") },
      { name: "Royal Brompton Hospital", type: "Specialist heart & lung hospital", blurb: "Specialist heart and lung hospital.", ...g("Royal Brompton Hospital") },
      { name: "Guy's and St Thomas' Hospital", type: "Teaching hospital", emergency: true, blurb: "Cardiology, cardiac surgery and specialist heart services.", ...g("Guy's and St Thomas' Hospital") },
      { name: "Royal Free Hospital", type: "Heart attack centre", emergency: true, blurb: "Heart attack centre and cardiology services.", operator: "Royal Free London", ...g("Royal Free Hospital London") },
      { name: "St George's Hospital", type: "Major NHS hospital", emergency: true, blurb: "Major NHS hospital with specialist cardiology.", ...g("St George's Hospital London") },
    ],
  },
  {
    region: "Wales — cardiac centres",
    entries: [
      { name: "University Hospital of Wales", type: "Tertiary care centre", emergency: true, blurb: "Major cardiac and tertiary care centre in Wales.", ...g("University Hospital of Wales Cardiff") },
      { name: "Morriston Hospital", type: "General hospital", emergency: true, blurb: "Cardiology and cardiac intervention services.", ...g("Morriston Hospital Swansea") },
      { name: "Glan Clwyd Hospital", rating: 3.4, type: "General hospital", blurb: "North Wales cardiac services.", ...g("Glan Clwyd Hospital") },
      { name: "University Hospital Llandough", rating: 3.9, type: "University hospital", blurb: "Cardiology and specialist medical services.", ...g("University Hospital Llandough") },
      { name: "Withybush General Hospital", type: "Emergency room", emergency: true, blurb: "Cardiac assessment and local emergency care.", ...g("Withybush General Hospital") },
    ],
  },
  {
    region: "Brighton / Sussex area",
    entries: [
      { name: "Royal Sussex County Hospital", type: "Major emergency hospital", emergency: true, blurb: "Major emergency hospital with cardiology services.", ...g("Royal Sussex County Hospital") },
      { name: "Brighton and Sussex University Hospitals NHS Trust", type: "NHS trust", blurb: "Provides specialist cardiovascular services.", ...g("University Hospitals Sussex NHS") },
      { name: "Princess Royal Hospital", rating: 4, type: "General hospital", blurb: "Cardiology and diagnostic services.", ...g("Princess Royal Hospital Haywards Heath") },
      { name: "Eastbourne District General Hospital", rating: 3.8, type: "General hospital", blurb: "Cardiology services for East Sussex.", ...g("Eastbourne District General Hospital") },
      { name: "Worthing Hospital", rating: 3.9, type: "General hospital", blurb: "Cardiac assessment and treatment services.", ...g("Worthing Hospital") },
    ],
  },
];
