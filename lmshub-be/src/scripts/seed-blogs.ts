import { pool } from '../core/db/pool';

async function seed() {
  console.log('Seeding initial blog posts...');

  const posts = [
    {
      title: 'Top Workplace Fire Safety Protocols Every Industry Must Follow',
      slug: 'top-workplace-fire-safety-protocols',
      summary: 'Essential guidelines, extinguisher classifications, and emergency evacuation strategies to prevent industrial hazards and safeguard personnel.',
      category: 'Fire Safety',
      tags: ['Safety', 'Fire Prevention', 'Compliance'],
      author_name: 'NFSI Technical Faculty',
      status: 'published',
      cover_image_url: 'https://images.unsplash.com/photo-1542385151-efd9000785a0?auto=format&fit=crop&w=1200&q=80',
      content: `<h2>Understanding Industrial Fire Hazards</h2>
<p>Workplace fires pose significant risks to human life, operational continuity, and valuable infrastructure. Implementing a robust, multi-layered fire prevention protocol is not merely a regulatory mandate—it is a moral imperative for every safety professional.</p>

<figure style="margin: 24px 0; border-radius: 12px; overflow: hidden; border: 1px solid #fed7aa; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
  <img src="https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=1000&q=80" alt="Industrial Fire Safety and Response Equipment" style="width: 100%; height: 320px; object-fit: cover; display: block;" />
  <figcaption style="padding: 10px 14px; background: #fff7ed; font-size: 13px; font-weight: 600; color: #9a3412; border-top: 1px solid #fed7aa;">
    🔥 Figure 1: Rapid-access fire extinguisher points and certified personal protective equipment.
  </figcaption>
</figure>

<h3>1. Classification of Fire Extinguishers</h3>
<p>Having the appropriate extinguisher readily accessible and properly inspected can mean the difference between an easily contained incident and a catastrophic failure:</p>
<ul>
  <li><strong>Class A:</strong> Combustible materials such as wood, paper, textiles, and plastics.</li>
  <li><strong>Class B:</strong> Flammable liquids, oils, paints, and solvents.</li>
  <li><strong>Class C:</strong> Energized electrical systems and equipment.</li>
  <li><strong>Class D:</strong> Combustible metals like magnesium and titanium.</li>
  <li><strong>Class K / F:</strong> Cooking oils and kitchen grease fires.</li>
</ul>

<h3>2. The P.A.S.S. Technique</h3>
<p>All personnel should be trained in the universal <strong>P.A.S.S.</strong> method:</p>
<ol>
  <li><strong>P - Pull</strong> the pin from the extinguisher handle.</li>
  <li><strong>A - Aim</strong> the nozzle at the base of the fire, not the flames.</li>
  <li><strong>S - Squeeze</strong> the operating lever to release the extinguishing agent.</li>
  <li><strong>S - Sweep</strong> side to side across the base until completely extinguished.</li>
</ol>

<h3>3. Evacuation Drills and Emergency Exits</h3>
<p>Ensure that all emergency exit paths are clearly illuminated, free from obstructions, and equipped with panic bars. Regular evacuation drills should be held bi-annually, with designated assembly points and roll-call coordinators.</p>`,
      published_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
      quiz_data: {
        enabled: true,
        title: 'Workplace Fire Safety & Emergency Preparedness Assessment',
        passing_score: 70,
        questions: [
          {
            id: 'q1',
            question: 'What is the primary action to take when the building fire alarm sounds?',
            options: [
              'Use the nearest elevator immediately',
              'Evacuate calmly using designated exit routes and proceed to the assembly point',
              'Wait at your workstation for a telephone confirmation',
              'Gather all personal office belongings before leaving'
            ],
            correct_answer: 1
          },
          {
            id: 'q2',
            question: 'What does the \'P\' stand for in the PASS technique for using a fire extinguisher?',
            options: [
              'Push the handle',
              'Pull the pin',
              'Point at the flames',
              'Press the base'
            ],
            correct_answer: 1
          },
          {
            id: 'q3',
            question: 'What does the complete acronym PASS stand for when operating a fire extinguisher?',
            options: [
              'Pull, Aim, Squeeze, Sweep',
              'Push, Alert, Spray, Stop',
              'Point, Activate, Soak, Secure',
              'Prepare, Alarm, Stand, Sweep'
            ],
            correct_answer: 0
          },
          {
            id: 'q4',
            question: 'Which type of fire extinguisher is safest for energized electrical equipment fires?',
            options: [
              'Water (Class A)',
              'Carbon Dioxide (CO2) or Dry Chemical Powder (DCP)',
              'Wet Chemical (Class K)',
              'Foam Extinguisher'
            ],
            correct_answer: 1
          },
          {
            id: 'q5',
            question: 'What fire classification covers fires involving flammable liquids such as gasoline, oil, and solvents?',
            options: [
              'Class A',
              'Class B',
              'Class C',
              'Class D'
            ],
            correct_answer: 1
          },
          {
            id: 'q6',
            question: 'What fire classification involves ordinary combustible materials like wood, paper, and cloth?',
            options: [
              'Class A',
              'Class B',
              'Class C',
              'Class K'
            ],
            correct_answer: 0
          },
          {
            id: 'q7',
            question: 'Why should elevators never be used during a fire evacuation?',
            options: [
              'Elevators move too slowly',
              'Power may fail and trap occupants inside, or shafts can draw smoke and heat',
              'Elevators are reserved exclusively for management',
              'Elevators will trigger additional building alarms'
            ],
            correct_answer: 1
          },
          {
            id: 'q8',
            question: 'How often should emergency fire exit pathways and fire doors be kept clear of obstructions?',
            options: [
              'Only during scheduled safety audits',
              'At all times (24/7) without exception',
              'During working hours only',
              'Only when the warehouse is full'
            ],
            correct_answer: 1
          },
          {
            id: 'q9',
            question: 'What is the designated gathering location outside the facility during an evacuation called?',
            options: [
              'Safe Haven Area',
              'Emergency Assembly Point (Muster Point)',
              'Loading Dock Zone',
              'Parking Lot Exit'
            ],
            correct_answer: 1
          },
          {
            id: 'q10',
            question: 'What is the primary role of a designated Fire Warden / Floor Marshal during an emergency?',
            options: [
              'Fight large structural fires alone',
              'Assist in orderly evacuation, check areas, and report headcount at the assembly point',
              'Protect company computers and sensitive paperwork',
              'Lock all exit doors behind them'
            ],
            correct_answer: 1
          },
          {
            id: 'q11',
            question: 'If your clothing catches fire, what is the recommended immediate survival technique?',
            options: [
              'Run quickly to find water',
              'Stop, Drop to the ground, and Roll to smother the flames',
              'Fan the flames with a jacket',
              'Stand upright and call for help'
            ],
            correct_answer: 1
          },
          {
            id: 'q12',
            question: 'When escaping through a smoke-filled hallway, what is the safest posture to take?',
            options: [
              'Walk upright with hands over your eyes',
              'Crawl low on hands and knees where the air is cleaner and cooler',
              'Run as fast as possible while holding your breath',
              'Hide in an enclosed closet until rescued'
            ],
            correct_answer: 1
          },
          {
            id: 'q13',
            question: 'Before opening a closed door during a fire evacuation, what should you do first?',
            options: [
              'Kick the door open immediately',
              'Check the door and handle with the back of your hand for heat',
              'Look through the keyhole',
              'Pull the door handle forcefully'
            ],
            correct_answer: 1
          },
          {
            id: 'q14',
            question: 'What three elements make up the traditional Fire Triangle?',
            options: [
              'Heat, Fuel, and Oxygen',
              'Water, Carbon, and Smoke',
              'Electricity, Air, and Pressure',
              'Gas, Ignition, and Wind'
            ],
            correct_answer: 0
          },
          {
            id: 'q15',
            question: 'What minimum clearance distance must be maintained around electrical panels and fire extinguishers?',
            options: [
              'At least 3 feet (approx. 1 meter) of clear, unobstructed access',
              'No clearance is necessary if items are labeled',
              '6 inches',
              'Only clearance from the ceiling is required'
            ],
            correct_answer: 0
          },
          {
            id: 'q16',
            question: 'What type of fire extinguisher is specifically designed for commercial kitchen cooking oil and grease fires?',
            options: [
              'Class A (Water)',
              'Class K / Wet Chemical',
              'Class B (Standard Dry Powder)',
              'Class D (Metal)'
            ],
            correct_answer: 1
          },
          {
            id: 'q17',
            question: 'How frequently should industrial workplace fire evacuation drills be conducted at minimum?',
            options: [
              'Once every 5 years',
              'At least every 6 to 12 months, as per safety regulations',
              'Only when a new employee joins',
              'Never, as drills disrupt production'
            ],
            correct_answer: 1
          },
          {
            id: 'q18',
            question: 'What should you do immediately if you discover a fire in your workplace?',
            options: [
              'Sound the nearest fire alarm and alert occupants, then call emergency services',
              'Attempt to extinguish it regardless of fire size before telling anyone',
              'Finish your current task before leaving',
              'Send an email to HR reporting the hazard'
            ],
            correct_answer: 0
          },
          {
            id: 'q19',
            question: 'Why must fire doors never be propped open with wedges or doorstops?',
            options: [
              'They cause drafts and increase AC power bills',
              'They are designed to compartmentalize and contain smoke, heat, and toxic gases',
              'Propped doors violate noise ordinances',
              'It wears out the door hinges prematurely'
            ],
            correct_answer: 1
          },
          {
            id: 'q20',
            question: 'What is the minimum score required on this 20-question assessment to earn your Certificate of Participation?',
            options: [
              '10 out of 20 (50%)',
              '14 out of 20 (70%)',
              '18 out of 20 (90%)',
              '20 out of 20 (100%)'
            ],
            correct_answer: 1
          }
        ]
      },
    },
    {
      title: 'Lockout/Tagout (LOTO): Preventing Hazardous Energy Releases',
      slug: 'lockout-tagout-loto-preventing-hazardous-energy',
      summary: 'A step-by-step breakdown of OSHA-compliant Lockout/Tagout procedures to protect maintenance teams from unexpected machinery startup.',
      category: 'Industrial Safety',
      tags: ['LOTO', 'OSHA', 'Machine Safety'],
      author_name: 'NFSI Safety Officer',
      status: 'published',
      cover_image_url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=80',
      content: `<h2>What is Lockout/Tagout (LOTO)?</h2>
<p>Lockout/Tagout (LOTO) refers to specific practices and procedures necessary to safeguard employees from the unexpected energization or startup of machinery and equipment, or the release of hazardous energy during service or maintenance activities.</p>

<figure style="margin: 24px 0; border-radius: 12px; overflow: hidden; border: 1px solid #cbd5e1; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
  <img src="https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?auto=format&fit=crop&w=1000&q=80" alt="Lockout Tagout Safety Padlocks" style="width: 100%; height: 320px; object-fit: cover; display: block;" />
  <figcaption style="padding: 10px 14px; background: #f8fafc; font-size: 13px; font-weight: 600; color: #334155; border-top: 1px solid #cbd5e1;">
    🔒 Figure 1: OSHA-compliant padlocks, lockout hasps, and isolation tags applied to power disconnects.
  </figcaption>
</figure>

<h3>Core Energy Types Requiring Isolation</h3>
<ul>
  <li><strong>Electrical:</strong> Primary feeds, capacitor banks, battery backups.</li>
  <li><strong>Pneumatic:</strong> Compressed air lines and pressure reservoirs.</li>
  <li><strong>Hydraulic:</strong> High-pressure hydraulic fluid accumulators.</li>
  <li><strong>Mechanical / Gravitational:</strong> Suspended parts or kinetic springs.</li>
</ul>

<h3>Key Execution Steps</h3>
<ol>
  <li><strong>Preparation:</strong> Identify the energy source and potential risks.</li>
  <li><strong>Notification:</strong> Inform affected operators before servicing begins.</li>
  <li><strong>Shutdown:</strong> Power down the machinery safely following manufacturer steps.</li>
  <li><strong>Isolation:</strong> Physically disconnect or block the energy sources.</li>
  <li><strong>Lockout/Tagout Application:</strong> Attach standardized locks and tags.</li>
  <li><strong>Zero Energy Verification:</strong> Test controls to ensure no residual energy remains.</li>
</ol>`,
      published_at: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
    },
    {
      title: 'Arc Flash & Electrical Safety in High-Voltage Environments: Dos and Don’ts',
      slug: 'electrical-safety-high-voltage-environments',
      summary: 'Crucial arc flash explosion protection, NFPA 70E boundaries, PPE requirements, and zero-energy grounding protocols to prevent electrocution.',
      category: 'Electrical Safety',
      tags: ['Arc Flash', 'Electrical Safety', 'High Voltage', 'PPE'],
      author_name: 'NFSI Faculty',
      status: 'published',
      cover_image_url: 'https://images.unsplash.com/photo-1555680202-c86f0e12f086?auto=format&fit=crop&w=1200&q=80',
      content: `<h2>The Reality of Arc Flash & High-Voltage Electrocution</h2>
<p>Working around energized high-voltage switchgear carries catastrophic risks. An <strong>Arc Flash</strong> is an explosive electrical release that can reach temperatures exceeding <strong>19,000°C (35,000°F)</strong>—hotter than the surface of the sun—instantly vaporizing copper conductors and emitting lethal pressure waves.</p>

<!-- Flash Image / Arc Flash Explosion illustration -->
<figure style="margin: 24px 0; border-radius: 12px; overflow: hidden; border: 2px solid #f59e0b; box-shadow: 0 10px 15px -3px rgba(245, 158, 11, 0.2);">
  <img src="https://images.unsplash.com/photo-1517420704952-d9f39e95b43e?auto=format&fit=crop&w=1000&q=80" alt="High Voltage Electrical Arc Flash Explosion" style="width: 100%; height: 340px; object-fit: cover; display: block;" />
  <figcaption style="padding: 12px 16px; background: #fffbeb; font-size: 13px; font-weight: 700; color: #b45309; border-top: 1px solid #fde68a;">
    ⚡ Flash Hazard: Massive electrical arc flash discharge. Requires NFPA 70E rated Category 4 Arc Flash suit and face shield.
  </figcaption>
</figure>

<h3>Essential Electrical Safety Rules</h3>
<ul>
  <li>Always treat every conductor as <strong>live</strong> until physically tested, de-energized, and grounded.</li>
  <li>Wear certified Arc Flash face shields, balaclavas, and voltage-tested rubber insulating gloves (ASTM D120).</li>
  <li>Respect the <strong>Arc Flash Boundary</strong>: unauthorized personnel must remain outside the danger zone.</li>
  <li>Never use conductive measuring tapes, metal-framed glasses, or jewelry near energized switchboards.</li>
  <li>Always operate switchgear with your body positioned to the hinge side of the cabinet door (the "stand-aside" method).</li>
</ul>

<h3>Emergency Response for Arc Flash Incidents</h3>
<p>If an arc blast or electrical contact occurs, <strong>never touch the victim directly</strong> with bare hands. Use an insulated fiberglass rescue hook, de-energize the upstream feeder immediately, call emergency services, and initiate CPR if the victim is unresponsive.</p>`,
      published_at: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    },
    {
      title: 'Chemical Spill Response & HAZMAT Safety: Emergency Management Protocols',
      slug: 'chemical-spill-response-hazmat-safety-procedures',
      summary: 'Critical steps, PPE selection, and containment techniques to manage hazardous material releases and comply with global OSHA/GHS regulations.',
      category: 'Chemical Safety',
      tags: ['Chemical Safety', 'HAZMAT', 'Spill Kit', 'GHS SDS'],
      author_name: 'NFSI HAZMAT Specialist',
      status: 'published',
      cover_image_url: 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?auto=format&fit=crop&w=1200&q=80',
      content: `<h2>Understanding Chemical Hazards in Industrial Workspaces</h2>
<p>Hazardous chemicals, toxic vapors, corrosive reagents, and volatile organic solvents are common in modern production and testing environments. When accidental leaks occur, rapid and methodical containment prevents severe occupational injuries and environmental damage.</p>

<figure style="margin: 24px 0; border-radius: 12px; overflow: hidden; border: 1px solid #a7f3d0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
  <img src="https://images.unsplash.com/photo-1607613009820-a29f7bb81c04?auto=format&fit=crop&w=1000&q=80" alt="Chemical Spill Response and Protection" style="width: 100%; height: 320px; object-fit: cover; display: block;" />
  <figcaption style="padding: 10px 14px; background: #f0fdf4; font-size: 13px; font-weight: 600; color: #166534; border-top: 1px solid #a7f3d0;">
    🧪 Figure 1: Full-body chemical barrier suit, respirator, and sealed HAZMAT containment protocol.
  </figcaption>
</figure>

<h3>1. Immediate Action Protocol (The 5 C's)</h3>
<ol>
  <li><strong>Caution & Evacuation:</strong> Clear the affected perimeter immediately and isolate ignition sources.</li>
  <li><strong>Communicate:</strong> Sound the internal alarm and notify the designated emergency response coordinator.</li>
  <li><strong>Consult SDS:</strong> Identify the chemical name, UN hazard number, and consult the 16-section Safety Data Sheet (SDS) for toxicity and neutralization steps.</li>
  <li><strong>Containment:</strong> Deploy absorbent booms, chemical-resistant socks, and sand dikes around drains to stop runoff.</li>
  <li><strong>Clean-up & Disposal:</strong> Absorb remaining liquid using appropriate neutralizers, seal waste in labelled yellow HAZMAT containers, and document the incident.</li>
</ol>

<h3>2. Personal Protective Equipment (PPE) for Chemical Handlers</h3>
<p>Never approach an unidentified liquid without rated barrier protection. Standard protection includes:</p>
<ul>
  <li>Heavy-duty nitrile, butyl, or neoprene chemical gloves.</li>
  <li>Anti-splash safety goggles with secondary full-face shield.</li>
  <li>Respirators fitted with certified organic vapor and acid-gas cartridges (or SCBA for confined spaces).</li>
  <li>Chemical-impervious apron or full Tychem encapsulation suit.</li>
</ul>

<h3>3. Decontamination and Eyewash Stations</h3>
<p>Eyewash fountains and emergency body deluge showers must be tested weekly. In case of bodily contact, flush the affected area with clean water continuously for at least 15 minutes while seeking medical assistance.</p>`,
      published_at: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
    },
  ];

  for (const post of posts as any[]) {
    const check = await pool.query(`SELECT id FROM blog_posts WHERE slug = $1 AND deleted_at IS NULL`, [post.slug]);
    const quizJson = post.quiz_data ? JSON.stringify(post.quiz_data) : null;
    if (check.rows.length > 0) {
      await pool.query(
        `UPDATE blog_posts SET title = $1, summary = $2, content = $3, cover_image_url = $4, author_name = $5, category = $6, tags = $7, status = $8, published_at = $9, quiz_data = $10 WHERE id = $11`,
        [
          post.title,
          post.summary,
          post.content,
          post.cover_image_url,
          post.author_name,
          post.category,
          JSON.stringify(post.tags),
          post.status,
          post.published_at,
          quizJson,
          check.rows[0].id,
        ],
      );
    } else {
      await pool.query(
        `INSERT INTO blog_posts (title, slug, summary, content, cover_image_url, author_name, category, tags, status, published_at, quiz_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          post.title,
          post.slug,
          post.summary,
          post.content,
          post.cover_image_url,
          post.author_name,
          post.category,
          JSON.stringify(post.tags),
          post.status,
          post.published_at,
          quizJson,
        ],
      );
    }
  }

  console.log('Seeded blog posts successfully!');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
