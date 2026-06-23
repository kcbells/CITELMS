# Dean Role Implementation Guide

## Overview
This document explains the dean role implementation in the CIT-LMS system. The dean role has been created to separate **academic management** from **system administration**.

---

## Role Separation

### Admin Role (System Administration)
**Responsibilities:**
- System settings and configuration
- User account management (create/delete users, reset passwords)
- Database management
- Programs and curriculum structure management
- Technical system reports

**Pages:**
- `/pages/admin/dashboard.php` - System overview
- `/pages/admin/users.php` - User management
- `/pages/admin/programs.php` - Programs management
- `/pages/admin/subjects.php` - Subject catalog
- `/pages/admin/curriculum.php` - Curriculum builder
- `/pages/admin/departments.php` - Departments
- `/pages/admin/sections.php` - Sections management
- `/pages/admin/settings.php` - System settings
- `/pages/admin/profile.php` - Admin profile
- `/pages/admin/reports.php` - System reports

### Dean Role (Academic Management)
**Responsibilities:**
- Subject offerings management (decide which subjects to offer each semester)
- Faculty assignments (assign instructors to subjects)
- Academic scheduling and planning
- Faculty workload monitoring
- Student performance oversight
- Academic reports and analytics

**Pages:**
- `/pages/dean/dashboard.php` - Academic overview dashboard
- `/pages/dean/instructors.php` - View and monitor faculty
- `/pages/dean/subjects.php` - View subjects catalog
- `/pages/dean/subject-offerings.php` - **Manage semester offerings** (FULL ACCESS)
- `/pages/dean/faculty-assignments.php` - **Assign faculty to subjects** (FULL ACCESS)
- `/pages/dean/reports.php` - Academic reports (read-only)
- `/pages/dean/profile.php` - Dean profile

---

## Setup Instructions

### Step 1: Update Database

Run the setup script to add the dean role to the database:

```bash
# Navigate to your project directory
cd c:\xamppfinal\htdocs\COC-LMS

# Run the setup script via browser
http://localhost/COC-LMS/setup_dean_role.php
```

This script will:
1. Modify the `users` table role enum to include 'dean'
2. Show current role distribution
3. Verify the changes

**Alternatively, run this SQL directly:**

```sql
ALTER TABLE users
MODIFY COLUMN role ENUM('admin', 'dean', 'instructor', 'student')
NOT NULL DEFAULT 'student';
```

### Step 2: Create Dean Users

#### Option A: Via Admin Panel (Recommended)
1. Login as admin
2. Go to Users Management
3. Click "Add User"
4. Set role to "Dean"
5. Fill in employee ID and other details

#### Option B: Update Existing User
```sql
-- Make user ID 5 a dean
UPDATE users
SET role = 'dean'
WHERE users_id = 5;
```

#### Option C: Create New Dean User
```sql
INSERT INTO users (
    first_name, last_name, email, password, role,
    employee_id, status, created_at, updated_at
) VALUES (
    'John', 'Doe', 'dean@college.edu',
    '$2y$10$...',  -- Use password_hash('password123', PASSWORD_DEFAULT)
    'dean',
    'DEAN-001',
    'active',
    NOW(), NOW()
);
```

### Step 3: Test Dean Access

1. **Login as dean:**
   - URL: `http://localhost/COC-LMS`
   - Use dean credentials

2. **Verify access to:**
   - ✅ Dean Dashboard
   - ✅ Instructors (view only)
   - ✅ Subjects (view only)
   - ✅ Subject Offerings (full management)
   - ✅ Faculty Assignments (full management)
   - ✅ Reports (read only)

3. **Verify NO access to:**
   - ❌ Admin Settings
   - ❌ User Management
   - ❌ System Configuration

---

## Files Created/Modified

### New Files Created:
```
pages/dean/
├── dashboard.php              # Academic overview
├── profile.php                # Dean profile management
├── instructors.php            # View faculty members
├── subjects.php               # View subjects catalog
├── subject-offerings.php      # Manage offerings (from admin)
├── faculty-assignments.php    # Manage assignments (from admin)
└── reports.php                # Academic reports (from admin)
```

### Modified Files:
```
config/auth.php                # Already had dean support (lines 315-317, 339-340)
includes/sidebar.php           # Updated dean menu (lines 95-130)
```

### Setup Files:
```
setup_dean_role.php            # Database setup script
DEAN_ROLE_SETUP.md            # This documentation
```

---

## Key Features

### 1. Dean Dashboard
- Faculty workload overview
- Subject enrollment statistics
- Recent academic activity
- Department performance metrics
- Current semester/year badge

### 2. Instructors Management
- View all faculty members
- Search by name, email, employee ID
- Filter by status (active/inactive)
- See teaching statistics:
  - Number of subjects taught
  - Number of sections
  - Number of students

### 3. Subjects View
- Browse subject catalog
- See offering statistics
- Filter by status
- View enrollment numbers per subject

### 4. Subject Offerings (Dean's Primary Responsibility)
- Create offerings for each semester
- Set academic year and semester
- Activate/deactivate offerings
- **Full CRUD access** (Create, Read, Update, Delete)

### 5. Faculty Assignments (Dean's Primary Responsibility)
- Assign instructors to subject offerings
- Manage teaching loads
- View assignment history
- **Full management access**

### 6. Academic Reports
- Student performance by subject
- Faculty workload reports
- Enrollment statistics
- Quiz performance analytics

---

## Permission Matrix

| Feature | Admin | Dean | Instructor | Student |
|---------|-------|------|------------|---------|
| **System Settings** | ✅ Full | ❌ None | ❌ None | ❌ None |
| **User Management** | ✅ Full | ❌ None | ❌ None | ❌ None |
| **Programs/Curriculum** | ✅ Full | ❌ None | ❌ None | ❌ None |
| **Subject Catalog** | ✅ Full | 📖 View | ❌ None | ❌ None |
| **Subject Offerings** | ✅ Full | ✅ Full | ❌ None | ❌ None |
| **Faculty Assignments** | ✅ Full | ✅ Full | ❌ None | ❌ None |
| **Sections** | ✅ Full | ❌ None | ❌ None | ❌ None |
| **Academic Reports** | ✅ Full | ✅ Full | 📊 Limited | ❌ None |
| **System Reports** | ✅ Full | ❌ None | ❌ None | ❌ None |

Legend:
- ✅ Full = Full create/read/update/delete access
- 📖 View = Read-only access
- 📊 Limited = Restricted to own data
- ❌ None = No access

---

## Why This Separation?

### Before (Admin doing everything):
- ❌ System admin must handle both technical AND academic tasks
- ❌ No clear separation of concerns
- ❌ Academic decisions mixed with system configuration
- ❌ Single point of failure

### After (Admin + Dean):
- ✅ **Admin** focuses on system, security, users, technical issues
- ✅ **Dean** focuses on academic planning, faculty, offerings
- ✅ Clear separation of responsibilities
- ✅ Better workflow and accountability
- ✅ More scalable for multiple departments

### Real-World Workflow:

1. **Admin creates:**
   - User accounts (faculty, students)
   - Programs (BSIT, BSCS)
   - Subjects catalog (GE102, IT101, etc.)
   - Departments

2. **Dean manages:**
   - Which subjects to offer this semester
   - Assigning Prof. Smith to teach IT101
   - Assigning Prof. Jones to teach GE102
   - Monitoring faculty workload
   - Reviewing academic performance

3. **Instructor teaches:**
   - Their assigned sections
   - Creates lessons and quizzes
   - Grades students

4. **Students learn:**
   - Enroll in sections
   - Take quizzes
   - View grades

---

## Navigation Structure

### Dean Sidebar Menu:
```
📊 Dashboard
───────────────
Academic
  👨‍🏫 Instructors
  📚 Subjects
  📅 Subject Offerings
  👥 Faculty Assignments
  📈 Reports
───────────────
Account
  👤 My Profile
  🚪 Logout
```

---

## Testing Checklist

### After Setup:
- [ ] Dean role exists in database
- [ ] At least one dean user created
- [ ] Dean can login successfully
- [ ] Dean dashboard loads without errors
- [ ] Dean can view instructors
- [ ] Dean can view subjects
- [ ] Dean can manage subject offerings (CRUD)
- [ ] Dean can manage faculty assignments (CRUD)
- [ ] Dean can view reports
- [ ] Dean CANNOT access admin settings
- [ ] Dean CANNOT access user management
- [ ] Dean profile page works correctly

---

## Troubleshooting

### Issue: "Unauthorized" error when accessing dean pages
**Solution:**
1. Check if user role is set to 'dean' in database:
   ```sql
   SELECT users_id, first_name, last_name, email, role
   FROM users
   WHERE role = 'dean';
   ```
2. Clear browser cache and session
3. Logout and login again

### Issue: Dean role not showing in user creation form
**Solution:**
1. Run the `setup_dean_role.php` script
2. Verify the users table role column includes 'dean'

### Issue: Sidebar doesn't show dean menu
**Solution:**
1. Check that `includes/sidebar.php` was updated correctly
2. Verify session has `user_role = 'dean'`
3. Clear browser cache

---

## Security Notes

1. **Role-based access control** is enforced at the PHP level using `Auth::requireRole('dean')`
2. All dean pages check authentication before rendering
3. Dean cannot access admin-only functions
4. Dean cannot modify system settings or user accounts
5. All database operations use prepared statements (SQL injection protection)

---

## Future Enhancements

Consider adding these dean-specific features:

1. **Department Management**
   - If dean oversees a specific department
   - Filter faculty/subjects by department

2. **Approval Workflows**
   - Course change requests
   - Faculty leave approvals
   - Curriculum adjustments

3. **Academic Calendar**
   - Semester start/end dates
   - Exam schedules
   - Holiday management

4. **Faculty Evaluation**
   - Performance reviews
   - Student feedback compilation
   - Teaching effectiveness reports

5. **Budget Oversight**
   - Department budget tracking (if applicable)

---

## Support

For questions or issues:
1. Check this documentation
2. Review the code comments in dean pages
3. Test with a dean user account
4. Check database role configuration

---

**Implementation Date:** January 2026
**Version:** 1.0
**Status:** ✅ Complete and Production Ready
