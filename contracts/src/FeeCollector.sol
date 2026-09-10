// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ICurveAdmin {
    function setFee(uint256 _createFee, uint256 _pumpFee) external returns (bool);
}

contract FeeCollector is Ownable2Step {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOMINATOR = 10000;

    address public immutable curve;
    address public immutable lpLocker;
    address public treasury;
    uint256 public creatorShareBps;

    // Keyed by account, then by the asset the fee was paid in — address(0) for native.
    mapping(address => mapping(address => uint256)) public claimable;

    event FeeShared(
        address indexed tokenAddr,
        address indexed creator,
        uint256 creatorAmount,
        uint256 treasuryAmount,
        bool isNative
    );
    event LpFeeShared(
        address indexed tokenAddr,
        address indexed creator,
        address indexed asset,
        uint256 creatorAmount,
        uint256 treasuryAmount
    );
    event TreasuryCredited(uint256 amount);
    event Claimed(address indexed account, address indexed tokenAddr, uint256 amount);
    event CreatorShareSet(uint256 bps);
    event TreasurySet(address treasury);

    modifier onlyCurve() {
        require(msg.sender == curve, "only curve");
        _;
    }

    modifier onlyLpLocker() {
        require(msg.sender == lpLocker, "only lp locker");
        _;
    }
    
    constructor(address _treasury, uint256 _creatorShareBps, address _curve, address _lpLocker) {
        treasury = _treasury;
        creatorShareBps = _creatorShareBps;
        curve = _curve;
        lpLocker = _lpLocker;
    }

    receive() external payable onlyCurve {
        claimable[treasury][address(0)] += msg.value;
        emit TreasuryCredited(msg.value);
    }

    function collectNative(address _tokenAddr, address _creator) external payable onlyCurve {
        _share(_tokenAddr, _creator, msg.value, address(0));
    }

    function collectToken(address _tokenAddr, address _creator, uint256 _amount) external onlyCurve {
        IERC20(_tokenAddr).safeTransferFrom(curve, address(this), _amount);
        _share(_tokenAddr, _creator, _amount, _tokenAddr);
    }

    function collectAsset(address _tokenAddr, address _creator, address _asset, uint256 _amount)
        external
        onlyLpLocker
    {
        IERC20(_asset).safeTransferFrom(msg.sender, address(this), _amount);
        (uint256 creatorCut, uint256 treasuryCut) = _credit(_creator, _asset, _amount);
        emit LpFeeShared(_tokenAddr, _creator, _asset, creatorCut, treasuryCut);
    }

    function _share(address _tokenAddr, address _creator, uint256 _amount, address _feeAsset) private {
        (uint256 creatorCut, uint256 treasuryCut) = _credit(_creator, _feeAsset, _amount);
        emit FeeShared(_tokenAddr, _creator, creatorCut, treasuryCut, _feeAsset == address(0));
    }

    function _credit(address _creator, address _feeAsset, uint256 _amount)
        private
        returns (uint256 creatorCut, uint256 treasuryCut)
    {
        if (_creator != address(0)) creatorCut = (_amount * creatorShareBps) / BPS_DENOMINATOR;
        treasuryCut = _amount - creatorCut;
        if (creatorCut > 0) claimable[_creator][_feeAsset] += creatorCut;
        if (treasuryCut > 0) claimable[treasury][_feeAsset] += treasuryCut;
    }

    function renounceOwnership() public pure override {
        revert("renounce disabled");
    }

    function setCreatorShareBps(uint256 _bps) external onlyOwner {
        require(_bps <= BPS_DENOMINATOR, "share too high");
        creatorShareBps = _bps;
        emit CreatorShareSet(_bps);
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "invalid treasury");
        treasury = _treasury;
        emit TreasurySet(_treasury);
    }

    function setCurveFee(uint256 _createFee, uint256 _pumpFee) external onlyOwner returns (bool) {
        return ICurveAdmin(curve).setFee(_createFee, _pumpFee);
    }

    function claim(address _tokenAddr) external returns (uint256) {
        uint256 amount = claimable[msg.sender][_tokenAddr];
        require(amount > 0, "nothing to claim");
        claimable[msg.sender][_tokenAddr] = 0;
        emit Claimed(msg.sender, _tokenAddr, amount);
        if (_tokenAddr == address(0)) {
            (bool ok, ) = payable(msg.sender).call{value: amount}("");
            require(ok, "native transfer failed");
        } else {
            IERC20(_tokenAddr).safeTransfer(msg.sender, amount);
        }
        return amount;
    }
}
