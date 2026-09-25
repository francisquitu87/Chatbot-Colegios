update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]::text[]
where id = 'generated-files';
