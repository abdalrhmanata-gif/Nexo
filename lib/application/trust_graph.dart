import '../domain/trust_graph.dart';

class TrustGraphViolation implements Exception {
  final String code;
  const TrustGraphViolation(this.code);
  @override
  String toString() => 'TrustGraphViolation($code)';
}

class TrustGraph {
  final Map<String, TrustNode> _nodes = {};
  final Map<String, TrustEdge> _edges = {};

  List<TrustNode> get nodes => List.unmodifiable(_nodes.values);
  List<TrustEdge> get edges => List.unmodifiable(_edges.values);

  void addNode(TrustNode node) {
    final existing = _nodes[node.id];
    if (existing != null && existing != node) {
      throw const TrustGraphViolation('NODE_ID_COLLISION');
    }
    _nodes[node.id] = node;
  }

  void addEdge(TrustEdge edge) {
    final from = _nodes[edge.fromId];
    final to = _nodes[edge.toId];
    if (from == null || to == null) {
      throw const TrustGraphViolation('EDGE_ENDPOINT_MISSING');
    }
    if (from.organizationId != edge.organizationId ||
        to.organizationId != edge.organizationId) {
      throw const TrustGraphViolation('CROSS_TENANT_EDGE');
    }
    _edges[edge.id] = edge;
  }

  bool canExplainOutcome(String outcomeId) {
    final outcome = _nodes[outcomeId];
    if (outcome == null || outcome.type != TrustNodeType.outcome) return false;

    final incoming = _edges.values.where((e) => e.toId == outcomeId);
    final verified = incoming.any((e) => e.type == TrustEdgeType.verifies);
    final causal = incoming.any((e) => e.type == TrustEdgeType.resultsIn);
    return verified && causal;
  }

  List<TrustEdge> pathTo(String targetId) {
    final result = <TrustEdge>[];
    final seen = <String>{};
    var frontier = <String>[targetId];

    while (frontier.isNotEmpty) {
      final next = <String>[];
      for (final id in frontier) {
        if (!seen.add(id)) continue;
        final incoming = _edges.values.where((e) => e.toId == id);
        for (final edge in incoming) {
          result.add(edge);
          next.add(edge.fromId);
        }
      }
      frontier = next;
    }
    return List.unmodifiable(result);
  }
}
