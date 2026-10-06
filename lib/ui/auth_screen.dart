import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

String? _webRedirectUrl() {
  final uri = Uri.base;
  if (uri.scheme != 'http' && uri.scheme != 'https') return null;
  return uri.replace(query: null, fragment: null).toString();
}

class AuthScreen extends StatefulWidget {
  final VoidCallback onAuthenticated;

  const AuthScreen({super.key, required this.onAuthenticated});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _signUp = false;
  bool _loading = false;
  bool _obscurePassword = true;

  SupabaseClient get _client => Supabase.instance.client;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _email.text.trim();
    final password = _password.text;

    if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(email)) {
      _message('Enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      _message('Password must be at least 8 characters.');
      return;
    }

    setState(() => _loading = true);
    try {
      if (_signUp) {
        final response = await _client.auth.signUp(
          email: email,
          password: password,
          emailRedirectTo: _webRedirectUrl(),
        );
        if (!mounted) return;
        if (response.session == null) {
          _message(
            'Account created. Check your email to confirm your account, then sign in.',
          );
        } else {
          widget.onAuthenticated();
        }
      } else {
        await _client.auth.signInWithPassword(
          email: email,
          password: password,
        );
        if (mounted) widget.onAuthenticated();
      }
    } on AuthException catch (e) {
      _message(e.message);
    } catch (e) {
      _message('Authentication failed: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _googleSignIn() async {
    setState(() => _loading = true);
    try {
      final started = await _client.auth.signInWithOAuth(
        OAuthProvider.google,
        redirectTo: _webRedirectUrl(),
      );
      if (!started && mounted) {
        _message('Google sign-in could not be started.');
      }
    } on AuthException catch (e) {
      _message(e.message);
    } catch (e) {
      _message('Google sign-in failed: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _forgotPassword() async {
    final email = _email.text.trim();
    if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(email)) {
      _message('Enter your email address first.');
      return;
    }

    setState(() => _loading = true);
    try {
      await _client.auth.resetPasswordForEmail(
        email,
        redirectTo: _webRedirectUrl(),
      );
      if (mounted) {
        _message(
          'If an account exists for this email, a password reset link has been sent.',
        );
      }
    } on AuthException catch (e) {
      _message(e.message);
    } catch (e) {
      _message('Password reset could not be requested: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _message(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final title =
        _signUp ? 'Create your ZAVQERA account' : 'Sign in to ZAVQERA';

    return Scaffold(
      appBar: AppBar(title: const Text('ZAVQERA')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 440),
          child: ListView(
            padding: const EdgeInsets.all(24),
            shrinkWrap: true,
            children: [
              Text(
                title,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 8),
              Text(
                _signUp
                    ? 'Create an account to use ZAVQERA AI planning securely.'
                    : 'Sign in to use ZAVQERA AI planning securely.',
              ),
              const SizedBox(height: 24),
              OutlinedButton.icon(
                onPressed: _loading ? null : _googleSignIn,
                icon: const Icon(Icons.g_mobiledata),
                label: const Text('Continue with Google'),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  const Expanded(child: Divider()),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Text(
                      'OR',
                      style: Theme.of(context).textTheme.labelMedium,
                    ),
                  ),
                  const Expanded(child: Divider()),
                ],
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                autofillHints: const [AutofillHints.email],
                decoration: const InputDecoration(
                  labelText: 'Email',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _password,
                obscureText: _obscurePassword,
                autofillHints: const [AutofillHints.password],
                onSubmitted: (_) => _submit(),
                decoration: InputDecoration(
                  labelText: 'Password',
                  border: const OutlineInputBorder(),
                  suffixIcon: IconButton(
                    tooltip:
                        _obscurePassword ? 'Show password' : 'Hide password',
                    onPressed: () => setState(
                      () => _obscurePassword = !_obscurePassword,
                    ),
                    icon: Icon(
                      _obscurePassword
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                    ),
                  ),
                ),
              ),
              if (!_signUp)
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: _loading ? null : _forgotPassword,
                    child: const Text('Forgot password?'),
                  ),
                ),
              const SizedBox(height: 8),
              FilledButton(
                onPressed: _loading ? null : _submit,
                child: Text(
                  _loading
                      ? 'Please wait…'
                      : (_signUp ? 'Create account' : 'Sign in'),
                ),
              ),
              TextButton(
                onPressed: _loading
                    ? null
                    : () => setState(() => _signUp = !_signUp),
                child: Text(
                  _signUp
                      ? 'Already have an account? Sign in'
                      : 'New to ZAVQERA? Create an account',
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
