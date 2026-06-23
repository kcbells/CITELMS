    <?php
    /**
     * ============================================================
     * CIT-LMS Login Page
     * ============================================================
     * Public page - no authentication required
     * Redirects to dashboard if already logged in
     * ============================================================
     */

    // Load config (but don't require auth)
    require_once __DIR__ . '/../../config/constants.php';
    require_once __DIR__ . '/../../config/auth.php';

    // If already logged in, redirect to dashboard
    if (Auth::check()) {
        header('Location: ' . Auth::dashboardUrl());
        exit;
    }

    // Check for session timeout message
    $timeout = isset($_GET['timeout']) && $_GET['timeout'] == '1';
    ?>
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        
        <title>Login | <?= APP_NAME ?></title>
        
        <meta name="description" content="Login to <?= APP_NAME ?> - <?= APP_FULL_NAME ?>">
        <meta name="robots" content="noindex, nofollow">
        
        <!-- Favicon -->
        <link rel="icon" type="image/png" href="<?= BASE_URL ?>/assets/images/phinma_logo1.png">
        <link rel="apple-touch-icon" href="<?= BASE_URL ?>/assets/images/phinma_logo1.png">
        
        <!-- Stylesheets -->
        <link rel="stylesheet" href="<?= BASE_URL ?>/css/style.css">
        <link rel="stylesheet" href="<?= BASE_URL ?>/css/auth.css">
    </head>
    <body>
        
        <div class="auth-page">
            <div class="auth-container">
                
                <!-- Login Card -->
                <div class="auth-card">
                    
                    <!-- Header -->
                    <div class="auth-header">
                        <div class="auth-logo">
                            <img src="<?= BASE_URL ?>/assets/images/phinma_logo1.png" alt="PHINMA Logo" class="auth-logo-img">
                            <span class="auth-logo-text"><?= APP_NAME ?></span>
                        </div>
                        <h1>Welcome Back</h1>
                        <p>Sign in to access your learning dashboard</p>
                    </div>

                    <!-- Body -->
                    <div class="auth-body">

                        <!-- Error/Success Container -->
                        <div id="error-container" style="display: none;"></div>

                        <!-- Session Timeout Message -->
                        <?php if ($timeout): ?>
                        <div class="auth-error">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            <span>Your session has expired. Please login again.</span>
                        </div>
                        <?php endif; ?>

                        <!-- Demo Credentials (Remove in Production!) -->
                        <div class="demo-credentials">
                            <div class="demo-credentials-title">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
                                <span>Demo Credentials</span>
                            </div>
                            <div class="demo-credentials-list">
                                <div class="demo-row">
                                    <span class="demo-role">Admin</span>
                                    <a href="#" data-demo-id="ADMIN-001" data-demo-password="password123">
                                        <code>ADMIN-001</code>
                                    </a>
                                </div>
                                <div class="demo-row">
                                    <span class="demo-role">Instructor</span>
                                    <a href="#" data-demo-id="EMP-2024-001" data-demo-password="password123">
                                        <code>EMP-2024-001</code>
                                    </a>
                                </div>
                                <div class="demo-row">
                                    <span class="demo-role">Student</span>
                                    <a href="#" data-demo-id="2024-00001" data-demo-password="password123">
                                        <code>2024-00001</code>
                                    </a>
                                </div>
                                <div class="demo-password">
                                    Password for all: <code>password123</code>
                                </div>
                            </div>
                        </div>

                        <!-- Login Form -->
                        <form id="login-form" class="auth-form" method="POST" autocomplete="on">

                            <!-- User ID -->
                            <div class="form-group">
                                <label for="user_id" class="form-label required">User ID</label>
                                <div class="form-input-icon">
                                    <span class="input-icon">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                    </span>
                                    <input
                                        type="text"
                                        id="user_id"
                                        name="user_id"
                                        class="form-input"
                                        placeholder="Enter your Student ID or Employee ID"
                                        autocomplete="username"
                                        required
                                    >
                                </div>
                            </div>

                            <!-- Password -->
                            <div class="form-group">
                                <label for="password" class="form-label required">Password</label>
                                <div class="form-input-icon">
                                    <span class="input-icon">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                    </span>
                                    <input
                                        type="password"
                                        id="password"
                                        name="password"
                                        class="form-input"
                                        placeholder="Enter your password"
                                        autocomplete="current-password"
                                        required
                                        minlength="8"
                                        style="padding-right: 48px;"
                                    >
                                    <button type="button" id="password-toggle" class="password-toggle" title="Show/Hide Password">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                                    </button>
                                </div>
                            </div>

                            <!-- Remember Me & Forgot Password -->
                            <div class="auth-options">
                                <label class="form-check">
                                    <input type="checkbox" id="remember" name="remember" class="form-check-input">
                                    <span class="form-check-label">Remember me</span>
                                </label>
                            </div>

                            <!-- Submit Button -->
                            <button type="submit" id="submit-btn" class="auth-submit">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/></svg>
                                Sign In
                            </button>

                        </form>

                    </div>

                    <!-- Footer -->
                    <div class="auth-footer">
                        <p><?= APP_FULL_NAME ?></p>
                    </div>
                    
                </div>

            </div>
        </div>
        
        <!-- Scripts -->
        <script>
            // App config for JS
            const APP_CONFIG = {
                baseUrl: '<?= BASE_URL ?>',
                apiUrl: '<?= BASE_URL ?>/api'
            };
        </script>
        <script src="<?= BASE_URL ?>/js/auth.js"></script>
        
    </body>
    </html>