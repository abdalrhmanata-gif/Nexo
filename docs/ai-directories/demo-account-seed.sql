-- Sample data for the reviewers' demo account (ChatGPT, Claude and Gemini
-- directories all ask for a fully populated test account).
--
-- The owner creates the account on zavqera.com with a password only he
-- knows; this script only adds Missions to it. Replace DEMO_EMAIL, then run
-- it once on Production. Everything goes through the same functions the
-- website uses, acting as that account (auth.uid() is set from the email).

do $$
declare
  v_email text := 'DEMO_EMAIL';
  v_user uuid;
  v_ws uuid;
  m uuid;
  a uuid;
  v bigint;
begin
  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then raise exception 'No account with email %', v_email; end if;
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  v_ws := public.ensure_owned_workspace();

  -- 1. A personal errand with proof and a deadline.
  insert into public.missions (workspace_id, owner_id, objective, status)
  values (v_ws, v_user, E'Renew my passport\n\nGet a new passport before the trip in February, without paying for the express service.\n\nSuccess criteria:\nThe new passport is in hand\nThe old passport is cancelled', 'DRAFT')
  returning id into m;
  insert into public.mission_actions (mission_id, title, position, status) values
    (m, 'Book an appointment at the passport office', 0, 'PENDING'),
    (m, 'Gather the documents and a new photo', 1, 'PENDING'),
    (m, 'Attend the appointment and pay the fee', 2, 'PENDING'),
    (m, 'Collect the new passport', 3, 'PENDING');
  select id, version into a, v from public.mission_actions where mission_id = m and position = 0;
  perform public.complete_mission_action(a, v, 'Appointment confirmed, reference 48213', null);
  insert into public.mission_schedules (mission_id, target_date) values (m, current_date + 45);
  insert into public.action_due_dates (action_id, mission_id, due_on)
    select id, m, current_date + 5 from public.mission_actions where mission_id = m and position = 1;
  insert into public.action_due_dates (action_id, mission_id, due_on)
    select id, m, current_date + 12 from public.mission_actions where mission_id = m and position = 2;

  -- 2. A small business launch, partly done, one step late.
  insert into public.missions (workspace_id, owner_id, objective, status)
  values (v_ws, v_user, E'Launch a small online shop\n\nOpen a simple online shop for handmade candles and make the first ten sales before the holidays.\n\nSuccess criteria:\nThe shop takes real payments\nTen orders are paid', 'DRAFT')
  returning id into m;
  insert into public.mission_actions (mission_id, title, position, status) values
    (m, 'Choose the shop platform and the domain', 0, 'PENDING'),
    (m, 'Photograph the first twelve products', 1, 'PENDING'),
    (m, 'Set prices and shipping', 2, 'PENDING'),
    (m, 'Test a real order from start to finish', 3, 'PENDING'),
    (m, 'Announce the shop to friends and local groups', 4, 'PENDING');
  select id, version into a, v from public.mission_actions where mission_id = m and position = 0;
  perform public.complete_mission_action(a, v, 'Domain registered', 'https://example.com/receipt');
  select id, version into a, v from public.mission_actions where mission_id = m and position = 1;
  perform public.complete_mission_action(a, v, 'Twelve photos edited and uploaded', null);
  insert into public.mission_schedules (mission_id, target_date) values (m, current_date + 25);
  insert into public.action_due_dates (action_id, mission_id, due_on)
    select id, m, current_date - 2 from public.mission_actions where mission_id = m and position = 2;
  insert into public.action_due_dates (action_id, mission_id, due_on)
    select id, m, current_date + 6 from public.mission_actions where mission_id = m and position = 3;

  -- 3. An event from ZAVQERA's template, not started yet.
  insert into public.missions (workspace_id, owner_id, objective, status)
  values (v_ws, v_user, E'Organise Sara''s 30th birthday\n\nOrganise the event within budget, with every booking confirmed in writing and every guest invited on time.\n\nSuccess criteria:\nThe date, budget and number of guests are fixed\nThe venue and every supplier are booked with written confirmation\nEvery guest has been invited and the replies are counted', 'DRAFT')
  returning id into m;
  insert into public.mission_actions (mission_id, title, position, status) values
    (m, 'Set the date, budget and guest count', 0, 'PENDING'),
    (m, 'Compare three venues and book one', 1, 'PENDING'),
    (m, 'Book catering and any other suppliers', 2, 'PENDING'),
    (m, 'Send the invitations and track the replies', 3, 'PENDING'),
    (m, 'Confirm every booking one week before', 4, 'PENDING');
  insert into public.mission_schedules (mission_id, target_date) values (m, current_date + 60);
end $$;
