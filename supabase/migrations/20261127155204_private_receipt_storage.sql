insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ledger-receipts', 'ledger-receipts', false, 8388608, array['image/jpeg', 'image/png', 'image/webp']);

create policy "Ledger owners manage their own receipt images"
on storage.objects for all to authenticated
using (
  bucket_id = 'ledger-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'ledger-receipts'
  and (storage.foldername(name)) = array[(select auth.uid())::text]
  and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
);
