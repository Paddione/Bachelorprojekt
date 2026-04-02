<?php
/**
 * SSO Auto-Login Middleware for Invoice Ninja v5
 *
 * Reads X-Forwarded-Email/User headers from OAuth2 Proxy
 * and auto-authenticates the user in Invoice Ninja.
 */

namespace App\Http\Middleware;

use App\Models\User;
use App\Models\Account;
use App\Models\Company;
use App\Models\CompanyUser;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class SsoAutoLogin
{
    public function handle(Request $request, Closure $next)
    {
        $email = $request->header('X-Forwarded-Email');
        $name = $request->header('X-Forwarded-Preferred-Username', $request->header('X-Forwarded-User', ''));

        if (empty($email)) {
            return $next($request);
        }

        // Already logged in as the right user
        if (Auth::guard('user')->check() && Auth::guard('user')->user()->email === $email) {
            return $next($request);
        }

        $user = User::where('email', $email)->first();

        if (!$user) {
            $user = $this->createUser($email, $name);
        }

        if ($user) {
            Auth::guard('user')->login($user, true);
            session(['db' => config('database.default')]);
        }

        return $next($request);
    }

    private function createUser(string $email, string $name): ?User
    {
        try {
            $account = Account::first();
            $company = Company::first();

            if (!$account || !$company) {
                Log::error('SSO: No account or company found for user creation');
                return null;
            }

            $parts = explode(' ', $name, 2);
            $firstName = $parts[0] ?: explode('@', $email)[0];
            $lastName = $parts[1] ?? '';

            $user = new User();
            $user->account_id = $account->id;
            $user->email = $email;
            $user->first_name = $firstName;
            $user->last_name = $lastName;
            $user->password = bcrypt(Str::random(32));
            $user->email_verified_at = now();
            $user->has_password = false;
            $user->save();

            $companyUser = new CompanyUser();
            $companyUser->user_id = $user->id;
            $companyUser->company_id = $company->id;
            $companyUser->account_id = $account->id;
            $companyUser->is_admin = false;
            $companyUser->is_owner = false;
            $companyUser->notifications = CompanyUser::NOTIFICATIONS_DEFAULTS;
            $companyUser->settings = null;
            $companyUser->permissions = '';
            $companyUser->save();

            Log::info("SSO: Created user {$email} (id: {$user->id})");
            return $user;
        } catch (\Exception $e) {
            Log::error("SSO: Failed to create user {$email}: " . $e->getMessage());
            return null;
        }
    }
}
