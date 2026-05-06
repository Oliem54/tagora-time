insert into public.department_coverage_requirements (
  department,
  day_of_week,
  start_time,
  end_time,
  min_employees,
  min_hours,
  requirement_source,
  active
)
select seed.department,
       seed.day_of_week,
       seed.start_time::time,
       seed.end_time::time,
       seed.min_employees,
       seed.min_hours,
       seed.requirement_source,
       true
from (
  values
    ('Service après vente', 1, '08:00', '17:00', 1, 8, 'manual'),
    ('Service après vente', 2, '08:00', '17:00', 1, 8, 'manual'),
    ('Service après vente', 3, '08:00', '17:00', 1, 8, 'manual'),
    ('Service après vente', 4, '08:00', '17:00', 1, 8, 'manual'),
    ('Service après vente', 5, '08:00', '17:00', 1, 8, 'manual')
) as seed(department, day_of_week, start_time, end_time, min_employees, min_hours, requirement_source)
on conflict (department, day_of_week, requirement_source) do update
set start_time = excluded.start_time,
    end_time = excluded.end_time,
    min_employees = excluded.min_employees,
    min_hours = excluded.min_hours,
    active = true;
