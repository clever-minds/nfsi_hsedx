import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../l10n/app_localizations.dart';
import '../../models/learn.dart';
import '../../services/lms_service.dart';
import '../../widgets/common.dart';

class CoursePlayerScreen extends StatefulWidget {
  const CoursePlayerScreen({super.key, required this.courseId, this.title});
  final String courseId;
  final String? title;

  @override
  State<CoursePlayerScreen> createState() => _CoursePlayerScreenState();
}

class _CoursePlayerScreenState extends State<CoursePlayerScreen> {
  LearnCourse? _course;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final course = await LearnService.learn(widget.courseId);
      if (!mounted) return;
      setState(() {
        _course = course;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = AppLocalizations.of(context).loadContentFailed;
        _loading = false;
      });
    }
  }

  Future<void> _openLesson(LearnLesson lesson) async {
    if (lesson.terkunci) return;
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => _LessonView(lesson: lesson)),
    );
    if (changed == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_course?.title ?? widget.title ?? AppLocalizations.of(context).learn)),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Loading();
    if (_error != null) return ErrorView(message: _error!, onRetry: _load);
    final c = _course!;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _header(c),
        const SizedBox(height: 16),
        ...c.sections.map(_sectionTile),
      ],
    );
  }

  Widget _header(LearnCourse c) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(c.title, style: T.h3),
          const SizedBox(height: 12),
          ProgressBar(c.progressPercent),
          const SizedBox(height: 8),
          Text(
            AppLocalizations.of(context).lessonsCount(Fmt.angka(c.doneLessons), Fmt.angka(c.totalLessons)),
            style: T.soft,
          ),
        ],
      ),
    );
  }

  Widget _sectionTile(LearnSection section) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ExpansionTile(
        initiallyExpanded: true,
        shape: const Border(),
        collapsedShape: const Border(),
        title: Text(section.title, style: T.h3),
        childrenPadding: EdgeInsets.zero,
        children: section.lessons.map(_lessonTile).toList(),
      ),
    );
  }

  Widget _lessonTile(LearnLesson lesson) {
    final locked = lesson.terkunci;
    return ListTile(
      leading: Icon(
        _iconFor(lesson.tipe),
        color: locked ? AppColors.inkFaint : AppColors.brand,
      ),
      title: Text(
        lesson.title,
        style: T.body.copyWith(
          color: locked ? AppColors.inkFaint : AppColors.ink,
        ),
      ),
      subtitle: locked && lesson.dripInfo != null
          ? Text(lesson.dripInfo!, style: T.faint)
          : null,
      trailing: locked
          ? const Icon(Icons.lock_rounded, size: 18, color: AppColors.inkFaint)
          : lesson.finish
          ? const Icon(
              Icons.check_circle_rounded,
              size: 20,
              color: AppColors.success,
            )
          : const Icon(Icons.chevron_right_rounded, color: AppColors.inkFaint),
      onTap: locked ? null : () => _openLesson(lesson),
    );
  }

  IconData _iconFor(String tipe) {
    switch (tipe) {
      case 'video':
        return Icons.play_circle_outline;
      case 'text':
        return Icons.article_outlined;
      case 'quiz':
        return Icons.quiz_outlined;
      case 'assignment':
        return Icons.assignment_outlined;
      case 'document':
        return Icons.description_outlined;
      default:
        return Icons.circle_outlined;
    }
  }
}

/// Tampilan detail satu pelajaran (video / content) + tombol tandai finish.
class _LessonView extends StatefulWidget {
  const _LessonView({required this.lesson});
  final LearnLesson lesson;

  @override
  State<_LessonView> createState() => _LessonViewState();
}

class _LessonViewState extends State<_LessonView> {
  WebViewController? _controller;
  bool _marking = false;

  @override
  void initState() {
    super.initState();
    _setupWebView();
  }

  void _setupWebView() {
    final l = widget.lesson;
    if (l.videoUrl != null && l.videoUrl!.isNotEmpty) {
      _controller = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        // Videos uploaded to the Media Library arrive as a server path
        // (`/uploads/media/…`); a WebView cannot load that without the host.
        ..loadRequest(Uri.parse(Fmt.asset(l.videoUrl)!));
    } else if (l.content != null && _looksLikeHtml(l.content!)) {
      _controller = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..loadHtmlString(_wrapHtml(l.content!));
    }
  }

  bool _looksLikeHtml(String s) => RegExp(r'<[a-zA-Z]').hasMatch(s);

  String _wrapHtml(String body) =>
      '''
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: -apple-system, Roboto, sans-serif; padding: 16px; color: #0F172A; line-height: 1.6; font-size: 15px; }
  img { max-width: 100%; height: auto; }
  a { color: #4F46E5; }
</style>
</head>
<body>$body</body>
</html>
''';

  Future<void> _markDone() async {
    setState(() => _marking = true);
    try {
      await LearnService.updateLessonProgress(widget.lesson.id, finish: true);
      if (!mounted) return;
      showSnack(context, AppLocalizations.of(context).lessonMarkedDone);
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _marking = false);
      showSnack(context, e.message, error: true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _marking = false);
      showSnack(context, AppLocalizations.of(context).markDoneFailed, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = widget.lesson;
    return Scaffold(
      appBar: AppBar(title: Text(l.title)),
      body: ListView(
        children: [
          _content(l),
          Padding(
            padding: const EdgeInsets.all(16),
            child: SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: (_marking || l.finish) ? null : _markDone,
                icon: Icon(l.finish ? Icons.check_circle : Icons.check),
                label: Text(l.finish
                    ? AppLocalizations.of(context).alreadyDone
                    : AppLocalizations.of(context).markDone),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _content(LearnLesson l) {
    if (l.videoUrl != null && l.videoUrl!.isNotEmpty && _controller != null) {
      return AspectRatio(
        aspectRatio: 16 / 9,
        child: WebViewWidget(controller: _controller!),
      );
    }
    if (l.content != null && l.content!.isNotEmpty) {
      if (_controller != null) {
        return SizedBox(
          height: 480,
          child: WebViewWidget(controller: _controller!),
        );
      }
      // Konten text biasa.
      return Padding(
        padding: const EdgeInsets.all(16),
        child: SelectableText(l.content!, style: T.body),
      );
    }
    return Padding(
      padding: const EdgeInsets.all(24),
      child: EmptyState(
        icon: Icons.article_outlined,
        title: AppLocalizations.of(context).noContent,
        subtitle: AppLocalizations.of(context).lessonNoMaterial,
      ),
    );
  }
}
