create extension if not exists pgcrypto;

create table if not exists public.objects (
  id uuid primary key default gen_random_uuid(),
  object_code text unique,
  canonical_address text not null,
  street text,
  house_number text,
  postal_code text,
  city text default 'Wien',
  district integer,
  latitude numeric,
  longitude numeric,
  dropbox_folder_path text,
  dropbox_folder_id text,
  status text not null default 'active' check (status in ('active','archived','unclear')),
  intake_status text not null default 'new' check (intake_status in ('new','processing','ready','needs_review','error')),
  cadastral_community_code text,
  cadastral_community_name text,
  land_register_ez text,
  parcel_number text,
  parcel_area_m2 numeric,
  building_area_m2 numeric,
  ancillary_area_m2 numeric,
  zoning_code text,
  zoning_meaning text,
  zoning_class text,
  zoning_area_m2 numeric,
  protection_zone text,
  construction_period text,
  construction_period_2 text,
  building_type text,
  parking_district text,
  parking_period text,
  parking_max_duration text,
  parking_valid_from date,
  location_surcharge_eur_m2 numeric,
  location_surcharge_valid_from date,
  location_surcharge_verified boolean not null default false,
  current_rent_roll_date date,
  current_topography_date date,
  current_land_register_date date,
  total_area_m2 numeric,
  unit_count integer,
  monthly_rent_net numeric,
  annual_rent_net numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists objects_address_unique_idx on public.objects (lower(canonical_address));

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null references public.objects(id) on delete cascade,
  document_type text not null,
  title text not null,
  original_filename text,
  version_date date,
  status text not null default 'current' check (status in ('current','superseded','archive','review','error','duplicate')),
  dropbox_file_id text,
  dropbox_path text,
  content_hash text,
  source text,
  mime_type text,
  size_bytes bigint,
  supersedes_document_id uuid references public.documents(id) on delete set null,
  derived_from_document_id uuid references public.documents(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists documents_object_type_idx on public.documents(object_id, document_type);
create index if not exists documents_hash_idx on public.documents(content_hash);
create index if not exists documents_status_idx on public.documents(object_id, status);

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null references public.objects(id) on delete cascade,
  source_document_id uuid references public.documents(id) on delete set null,
  unit_key text not null,
  top text,
  staircase text,
  use_type text,
  category text,
  occupancy_status text,
  tenant_label text,
  area_m2 numeric,
  weighted_area_m2 numeric,
  rent_net_month numeric,
  rent_net_year numeric,
  rent_per_m2 numeric,
  target_rent_per_m2 numeric,
  target_rent_month numeric,
  contract_end date,
  contract_term text,
  share_percent numeric,
  hmz numeric,
  evb numeric,
  furniture_rent numeric,
  parking_rent numeric,
  additional_area_rent numeric,
  other_rent numeric,
  notes text,
  status text not null default 'current' check (status in ('current','superseded','review','error')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(object_id, unit_key, source_document_id)
);
create index if not exists units_object_idx on public.units(object_id);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  object_id uuid references public.objects(id) on delete cascade,
  job_type text not null,
  status text not null default 'queued' check (status in ('queued','running','waiting_user','completed','failed','cancelled')),
  trigger_type text,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jobs_object_status_idx on public.jobs(object_id, status);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

do $$ begin create trigger objects_set_updated_at before update on public.objects for each row execute function public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger documents_set_updated_at before update on public.documents for each row execute function public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger units_set_updated_at before update on public.units for each row execute function public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger jobs_set_updated_at before update on public.jobs for each row execute function public.set_updated_at(); exception when duplicate_object then null; end $$;

alter table public.objects enable row level security;
alter table public.documents enable row level security;
alter table public.units enable row level security;
alter table public.jobs enable row level security;
