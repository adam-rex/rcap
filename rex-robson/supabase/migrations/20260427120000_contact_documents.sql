-- Per-contact supporting documents. Metadata lives in `contact_documents`;
-- the actual binary lives in the `contact-documents` Supabase Storage bucket.

create table public.contact_documents (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  filename text not null,
  content_type text,
  size_bytes bigint,
  storage_bucket text not null,
  storage_path text not null,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);

comment on table public.contact_documents is
  'Files attached to a contact (PDFs, decks, term sheets, etc.).';
comment on column public.contact_documents.storage_path is
  'Object path within storage_bucket. Convention: <contact_id>/<uuid>-<safe-filename>.';

create index contact_documents_contact_id_idx
  on public.contact_documents (contact_id, created_at desc);

alter table public.contact_documents enable row level security;

create policy "contact_documents_authenticated_all"
  on public.contact_documents
  for all
  to authenticated
  using (true)
  with check (true);

-- Storage bucket holding the binary content (private; signed URLs only).
insert into storage.buckets (id, name, public)
values ('contact-documents', 'contact-documents', false)
on conflict (id) do nothing;

create policy "contact_documents_objects_select_authenticated"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'contact-documents');

create policy "contact_documents_objects_insert_authenticated"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'contact-documents');

create policy "contact_documents_objects_delete_authenticated"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'contact-documents');
