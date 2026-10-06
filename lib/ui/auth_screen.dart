import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

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

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _email.text.trim();
    final password = _password.text;

    if (email.isEmpty || password.length < 8) {
      _message('Enter a valid email and a password of at least 8 characters.');
      return;
    }

    setState(() => _loading = true);
    try {
      if (_signUp) {
        final response = await Supabase.instance.client.auth.signUp(
          email: email,
          password: password,
        );
        if (!mounted) return;
        if (response.session == null) {
          _message('Account created. Check your email to confirm your account, then sign in.');
        } else {
          widget.onAuthenticated();
        }
      } else {
        await Supabase.instance.client.auth.signInWithPassword(
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

  void _message(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final title = _signUp ? 'Create your ZAVQERA account' : 'Sign in to ZAVQERA';
    return Scaffold(
      appBar: AppBar(title: const Text('ZAVQERA')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 440),
          child: ListView(
            padding: const EdgeInsets.all(24),
            shrinkWrap: true,
            children: [
              Text(title, style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 8),
              Text(
                _signUp
                    ? 'Create an account to use ZAVQERA AI planning securely.'
                    : 'Your authenticated session is required before ZAVQERA can use AI planning.',
              ),
              const SizedBox(height: 24),
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
                obscureText: true,
                autofillHints: const [AutofillHints.password],
                onSubmitted: (_) => _submit(),
                decoration: const InputDecoration(
                  labelText: 'Password',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _loading ? null : _submit,
                child: Text(_loading
                    ? 'Please wait…'
                    : (_signUp ? 'Create account' : 'Sign in')),
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
