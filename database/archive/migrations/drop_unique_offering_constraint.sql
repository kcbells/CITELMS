-- Allow multiple instructors to be assigned to the same subject in the same semester
-- (one subject_offered row per instructor, each can be assigned to different sections)
ALTER TABLE subject_offered DROP INDEX unique_offering;
