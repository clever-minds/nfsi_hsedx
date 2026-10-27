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
      title: 'Electrical Safety in High-Voltage Environments: Dos and Don’ts',
      slug: 'electrical-safety-high-voltage-environments',
      summary: 'Crucial protective measures, arc flash PPE guidelines, and grounding rules to minimize the risk of electrocution in commercial installations.',
      category: 'Electrical Safety',
      tags: ['Electrical', 'PPE', 'Arc Flash'],
      author_name: 'NFSI Faculty',
      status: 'published',
      cover_image_url: 'https://images.unsplash.com/photo-1621905251918-48416bd8575a?auto=format&fit=crop&w=1200&q=80',
      content: `<h2>The Reality of Arc Flash & Electrocution</h2>
<p>Working around high-voltage equipment requires unwavering discipline, specialized personal protective equipment (PPE), and strict adherence to safe work distances.</p>

<h3>Essential Safety Rules</h3>
<ul>
  <li>Always treat every conductor as live until physically verified de-energized and grounded.</li>
  <li>Wear rated Arc Flash suits, face shields, and insulated rubber gloves tested to appropriate voltage standards.</li>
  <li>Maintain clear approach boundaries around live switchgear.</li>
  <li>Never use conductive measuring tapes, metal-framed glasses, or rings near energized switchboards.</li>
</ul>`,
      published_at: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    },
  ];

  for (const post of posts) {
    const check = await pool.query(`SELECT id FROM blog_posts WHERE slug = $1 AND deleted_at IS NULL`, [post.slug]);
    if (check.rows.length > 0) {
      await pool.query(
        `UPDATE blog_posts SET title = $1, summary = $2, content = $3, cover_image_url = $4, author_name = $5, category = $6, tags = $7, status = $8, published_at = $9 WHERE id = $10`,
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
          check.rows[0].id,
        ],
      );
    } else {
      await pool.query(
        `INSERT INTO blog_posts (title, slug, summary, content, cover_image_url, author_name, category, tags, status, published_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
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
