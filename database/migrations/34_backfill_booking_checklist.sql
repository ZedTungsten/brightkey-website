-- Backfill booking_checklist in global_settings for all existing companies with the default calendar checklist items
INSERT INTO public.global_settings (key, company_id, value)
SELECT 
  'booking_checklist',
  id,
  '[
    {"text": "Door opens and closes smoothly without obstruction", "indent": false},
    {"text": "Smart lock operates properly (locking and unlocking)", "indent": false},
    {"text": "Smart lock is successfully connected to the mobile app", "indent": false},
    {"text": "I know how to create an account on the app", "indent": true},
    {"text": "I have registered RFID card on the device", "indent": true},
    {"text": "All components, including the camera, screen, handle, keypad, mechanical unlock, and deadbolt, are free of defects", "indent": false},
    {"text": "Screws and fasteners are securely installed", "indent": false},
    {"text": "I have been invited to leave a review for LOOCK Cavite and has consented to taking a photo with the device for documentation", "indent": false},
    {"text": "Warranty coverage: 1 year on factory defects, 7 days on installation warranty (excludes user-caused damage, service may apply)", "indent": false}
  ]'::jsonb
FROM public.companies
ON CONFLICT (key, company_id) DO NOTHING;
