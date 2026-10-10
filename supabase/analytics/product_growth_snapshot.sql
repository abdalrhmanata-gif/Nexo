-- Aggregate-only product growth snapshot. Run with an authorized SQL-editor role.
-- Never returns user ids, mission content, recipients, or IP addresses.
select event_type, coalesce(template_id, '(all templates)') as template,
       count(*) as unique_signals, count(distinct user_id) as unique_users,
       min(created_at) as first_seen_at, max(created_at) as last_seen_at
from public.product_growth_events
where created_at >= now() - interval '30 days'
group by event_type, template_id
order by event_type, unique_users desc, template;
