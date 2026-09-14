enum TrustNodeType {
  principal,
  intent,
  mission,
  delegation,
  authority,
  policy,
  authorizationDecision,
  agent,
  action,
  tool,
  execution,
  externalEvent,
  evidence,
  verification,
  outcome,
}

enum TrustEdgeType {
  authorizes,
  governs,
  delegates,
  contains,
  selects,
  executes,
  invokes,
  produces,
  supports,
  verifies,
  resultsIn,
  causedBy,
  correlatedWith,
  supersedes,
}

class TrustNode {
  final String id;
  final TrustNodeType type;
  final String organizationId;
  final String fingerprint;
  const TrustNode({
    required this.id,
    required this.type,
    required this.organizationId,
    required this.fingerprint,
  });
}

class TrustEdge {
  final String id;
  final String fromId;
  final String toId;
  final TrustEdgeType type;
  final String organizationId;
  final String? evidenceRef;
  const TrustEdge({
    required this.id,
    required this.fromId,
    required this.toId,
    required this.type,
    required this.organizationId,
    this.evidenceRef,
  });
}
