import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class ResetPasswordScreen extends StatefulWidget {
  final VoidCallback onCompleted;

  const ResetPasswordScreen({super.key, required this.onCompleted});

  @override
  State<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends State<ResetPasswordScreen> {
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _loading = false;
  bool _obscure = true;

  @override
  void dispose() {
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _updatePassword() async {
    final password = _password.text;
    final confirm = _confirm.text;

    if (password.length < 8) {
      _message('Password must be at least 8 characters.');
      return;
    }
    if (password != confirm) {
      _message('Passwords do not match.');
      return;
    }

    setState(() => _loading = true);
    try {
      await Supabase.instance.client.auth.updateUser(
        UserAttributes(password: password),
      );
      if (!mounted) return;
      _message('Password updated successfully.');
      widget.onCompleted();
    } on AuthException catch (e) {
      _message(e.message);
    } catch (e) {
      _message('Password update failed: $e');
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
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Reset password')),
        body: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: ListView(
              padding: const EdgeInsets.all(24),
              shrinkWrap: true,
              children: [
                Text(
                  'Choose a new password',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 8),
                const Text(
                  'Use at least 8 characters. Your new password will replace the old one.',
                ),
                const SizedBox(height: 24),
                TextField(
                  controller: _password,
                  obscureText: _obscure,
                  autofocus: true,
                  autofillHints: const [AutofillHints.newPassword],
                  decoration: InputDecoration(
                    labelText: 'New password',
                    border: const OutlineInputBorder(),
                    suffixIcon: IconButton(
                      tooltip: _obscure ? 'Show password' : 'Hide password',
                      onPressed: () => setState(() => _obscure = !_obscure),
                      icon: Icon(
                        _obscure
                            ? Icons.visibility_outlined
                            : Icons.visibility_off_outlined,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _confirm,
                  obscureText: _obscure,
                  autofillHints: const [AutofillHints.newPassword],
                  onSubmitted: (_) => _updatePassword(),
                  decoration: const InputDecoration(
                    labelText: 'Confirm new password',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: _loading ? null : _updatePassword,
                  child: Text(_loading ? 'Updating…' : 'Update password'),
                ),
              ],
            ),
          ),
        ),
      );
}
