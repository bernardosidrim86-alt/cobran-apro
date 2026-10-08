create or replace function public.record_charge_payment(p_charge_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_charge public.charges%rowtype;
begin
  select *
    into v_charge
    from public.charges
   where id = p_charge_id
     and company_id = (select private.my_company_id())
   for update;

  if not found then
    raise exception 'charge_not_found';
  end if;

  if v_charge.status <> 'pending' then
    raise exception 'charge_not_pending';
  end if;

  insert into public.payments (
    company_id,
    charge_id,
    customer_id,
    amount,
    payment_method,
    paid_at
  ) values (
    v_charge.company_id,
    v_charge.id,
    v_charge.customer_id,
    v_charge.amount,
    v_charge.payment_method,
    now()
  );

  update public.charges
     set status = 'paid'
   where id = v_charge.id
     and company_id = v_charge.company_id;
end;
$function$;

revoke all on function public.record_charge_payment(uuid) from public, anon;
grant execute on function public.record_charge_payment(uuid) to authenticated;
