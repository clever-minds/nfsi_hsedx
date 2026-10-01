import { pool } from '../core/db/pool';

async function main() {
  const res = await pool.query("SELECT id, nama_file, path_object_storage FROM media_assets WHERE nama_file ILIKE '%Biodata%' LIMIT 1");
  console.log(JSON.stringify(res.rows));
  
  if (res.rows.length > 0) {
    const mediaId = res.rows[0].id;
    const pathStorage = res.rows[0].path_object_storage;
    
    // We update the courses table directly
    await pool.query(
      `UPDATE courses 
       SET thumbnail_media_id = $1,
           meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '{thumbnail_url}', to_jsonb($2::text))
       WHERE slug = 'fire-seafty'`,
      [mediaId, pathStorage]
    );
    console.log("Updated course meta!");
  } else {
    console.log("No image found");
  }
  
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
