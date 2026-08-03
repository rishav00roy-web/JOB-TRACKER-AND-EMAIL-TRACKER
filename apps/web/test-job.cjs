const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function addTestJob() {
  const { data, error } = await supabase
    .from('jobs')
    .insert([
      {
        job_title: 'Software Engineer',
        company: 'TestCorp',
        stage: 'applied',
        source: 'manual',
        application_link: 'https://testcorp.com/careers/1',
        notes: 'Testing the email tracker engine'
      }
    ])
    .select();

  if (error) {
    console.error('Error inserting job:', error);
  } else {
    console.log('Inserted test job successfully:', data[0].id);
  }
}

addTestJob();
