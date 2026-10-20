DO $disable_stale_whatsapp_automation$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'cobrancapro-whatsapp-automation'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;
END
$disable_stale_whatsapp_automation$;
